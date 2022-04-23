(function($) {
  //bitComet
  class Client {
    /**
     * 初始化实例
     * @param {*} options
     * loginName: 登录名
     * loginPwd: 登录密码
     * url: 服务器地址
     */
    init(options) {
      this.options = options;
      this.headers = {};

      if (this.options.address.substr(-1) == "/") {
        this.options.address = this.options.address.substr(
          0,
          this.options.address.length - 1
        );
      }

      console.log("bitComet.init", this.options.address);
    }

    /**
     * 执行指定的操作
     * @param {*} action 需要执行的执令
     * @param {*} data 附加数据
     * @return Promise
     */
    call(action, data) {
      console.log("bitComet.call", action, data);
      return new Promise((resolve, reject) => {
        switch (action) {
          case "addTorrentFromURL":
            this.addTorrentFromUrl(data, result => {
              if (result.status === "success") {
                resolve(result);
              } else {
                reject(result);
              }
            });
            break;

          // 测试是否可连接
          case "testClientConnectivity":
            this.requestAuthentication()
              .then(result => {
                resolve(true);
              })
              .catch((code, msg) => {
                reject({
                  status: "error",
                  code,
                  msg
                });
              });
            break;
        }
      });
    }

    /**
     * 检查认证状态
     * @param {*} callback
     */
     requestAuthentication(callback) {
      return new Promise((resolve, reject) => {
        var settings = {
          type: "GET",
          url: this.options.address + "/panel/",
          username: this.options.loginName,
          password: this.options.loginPwd,
          timeout: PTBackgroundService.options.connectClientTimeout
        };
        $.ajax(settings)
          .done((resultData, textStatus, request) => {
            this.isInitialized = true;
            if (callback) {
              callback(resultData);
            }
            resolve();
            console.log('!!! requestAuthentication Complete !!!');
          })
          .fail((jqXHR, textStatus, errorThrown) => {
            reject(jqXHR.status, textStatus);
            console.log('!!! requestAuthentication Fail !!!');
          });
      });
    }

    /**
     * 调用指定的RPC
     * @param {*} options
     * @param {*} callback
     * @param {*} tags
     */
    exec(options, callback, tags) {
      var settings = {
        type: "POST",
        method: "POST",
        processData: false,
        contentType: options.useForm ? "application/x-www-form-urlencoded" : false,
        url: this.options.address + options.method,
        data: options.params,
        timeout: PTBackgroundService.options.connectClientTimeout,
        success: (resultData, textStatus) => {
          if (callback) {
            callback(resultData, tags);
          }
        },
        error: (jqXHR, textStatus, errorThrown) => {
          console.log(jqXHR);
          this.requestAuthentication()
            .then(() => {
              this.exec(options, callback, tags);
            })
            .catch((code, msg) => {
              callback({
                status: "error",
                code,
                msg:
                  msg || code === 0
                    ? i18n.t("downloadClient.serverIsUnavailable")
                    : i18n.t("downloadClient.unknownError") //"服务器不可用或网络错误" : "未知错误"
              });
            });
        }
      };
      $.ajax(settings);
    }

    /**
     * 查询下载目录
     * @param {*} data
     * @param {*} callback
     */
    getDownloadPath(data, callback) {
      if (data.savePath) {
        callback(data.savePath);
        return;
      }
      this.exec(
        {
          method: "/panel/task_add_magnet"
        },
        resultData => {
          if (callback) {
            let domparser = new DOMParser();
            var html = domparser.parseFromString(resultData, 'text/html');
            let input = html.body.getElementsByTagName("INPUT")[1];
            callback(input.value);
          } else {
            callback("\\Downloads");
          }
        }
      );

    }
  
    /**
     * 添加种子链接
     * @param {*} data
     * @param {*} callback
     */
    addTorrentFromUrl(data, callback) {
      let formData = new FormData();
      this.getDownloadPath(data, savePath => {
        formData.append("save_path", savePath);
        let url = data.url;
        // 磁力链接
        if (url.startsWith('magnet:')) {
          formData.append('url', url);
          let formString = "save_path=" + encodeURIComponent(savePath) + "&url=" + encodeURIComponent(url);
          this.addTorrent(formString, callback, "/panel/task_add_magnet_result", true);
        } else {
          PTBackgroundService.requestMessage({
            action: "getTorrentDataFromURL",
            data: url
          })
            .then(result => {
              formData.append("torrent_file", result);
              this.addTorrent(formData, callback, "/panel/task_add_bt_result", false);
            })
            .catch(result => {
              callback && callback(result);
            });
        }
      });
    }

    addTorrent(params, callback, method, useForm) {
      this.exec(
        {
          method: method,
          params: params,
          useForm: useForm
        },
        resultData => {
          if (callback) {
            let domparser = new DOMParser();
            var result = {status: "", msg: ""};
            var html = domparser.parseFromString(resultData, 'text/html');
            if (html.body.innerText.match('succeed')) {
              result.status = "success";
              result.msg = i18n.t("downloadClient.addURLSuccess", {
                name: this.options.name
              }); //"URL已添加至 bitComet 。";
            } else if (html.body.innerText.match('Task already exists')) {
              result.status = "fail";
              result.msg = i18n.t("downloadClient.taskAlreadyExist", {
                name: this.options.name
              });
            } else {
              result.status = "fail";
              result.msg = i18n.t("downloadClient.unknownError", {
                name: this.options.name
              });
            }
            callback(result);
          }
          console.log(resultData);
        }
      );
    }
  }

  window.BitComet = Client;
})(jQuery, window);
