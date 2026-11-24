(function () {
  "use strict";

  var candidates = ["Source Han Serif SC", "Source Han Serif CN", "思源宋体", "Noto Serif SC"];
  var status = { label: "正在检测字体…", source: "checking", ready: false, detail: "" };
  var listeners = [];

  function publish(next) {
    status = Object.assign({}, status, next);
    listeners.slice().forEach(function (listener) {
      try { listener(Object.assign({}, status)); } catch (error) { /* isolate listeners */ }
    });
  }

  function locallyAvailable() {
    var fonts = document.fonts;
    var canvas = document.createElement("canvas");
    var context = canvas.getContext && canvas.getContext("2d");
    if (!context) return [];
    var sample = "菩提觉照本来面目WmQq";
    var genericWidth;
    context.font = '32px serif';
    genericWidth = context.measureText(sample).width;
    return candidates.filter(function (name) {
      var checked = false;
      if (fonts && typeof fonts.check === "function") {
        try { checked = fonts.check('32px "' + name + '"', sample); } catch (error) { checked = false; }
      }
      context.font = '32px "' + name + '", serif';
      var candidateWidth = context.measureText(sample).width;
      var canvasConfirms = Math.abs(candidateWidth - genericWidth) > 0.1;
      // FontFaceSet.check() can report true when fallback rendering is ready;
      // require a distinct canvas measurement before treating the family as installed.
      if (checked && canvasConfirms) return true;
      return canvasConfirms;
    });
  }

  function loadSheet(url, label) {
    return new Promise(function (resolve, reject) {
      var link = document.createElement("link");
      var settled = false;
      var timer = window.setTimeout(function () {
        if (!settled) { settled = true; reject(new Error("font stylesheet timeout")); }
      }, 4000);
      link.rel = "stylesheet";
      link.href = url;
      link.onload = function () {
        if (settled) return;
        var fonts = document.fonts;
        var load = fonts && typeof fonts.load === "function"
          ? fonts.load('16px "Noto Serif SC"', "菩提觉照经文")
          : Promise.resolve([]);
        Promise.resolve(load).then(function (loaded) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          if (loaded && loaded.length) resolve(label);
          else reject(new Error("font face unavailable"));
        }, function (error) {
          if (settled) return;
          settled = true;
          window.clearTimeout(timer);
          reject(error);
        });
      };
      link.onerror = function () {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error("font stylesheet failed"));
      };
      document.head.appendChild(link);
    });
  }

  function watchReady() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        if (status.source === "online") publish({ ready: true });
      });
    }
  }

  var local = locallyAvailable();
  if (local.length) {
    publish({ label: "本地思源宋体 · 已就绪", source: "local", ready: true, detail: local[0] });
  } else {
    loadSheet("https://fonts.loli.net/css2?family=Noto+Serif+SC:wght@300;400;500;600;700&display=swap", "国内字体源")
      .catch(function () {
        publish({ label: "正在尝试在线字体…", source: "fallback", ready: false });
        return loadSheet("https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;500;600;700&display=swap", "Google Fonts");
      })
      .then(function (provider) {
        if (provider) {
          publish({ label: "在线思源宋体 · 已就绪", source: "online", ready: true, detail: provider });
          watchReady();
        }
      })
      .catch(function () {
        publish({ label: "系统衬线回退 · 可安装思源宋体以获得最佳离线质感", source: "system", ready: false });
      });
  }

  window.BODHI_FONT = {
    getStatus: function () { return Object.assign({}, status); },
    onChange: function (callback) {
      if (typeof callback !== "function") return function () {};
      listeners.push(callback);
      callback(Object.assign({}, status));
      return function () { listeners = listeners.filter(function (item) { return item !== callback; }); };
    }
  };
})();
