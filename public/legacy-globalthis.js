// Android 9 WebView 69 lacks ES2020 globalThis and queueMicrotask.
// Keep this as a classic parser-blocking asset before deferred Vite modules.
// Only install the missing standard APIs; do not change supported WebViews.
if (typeof window.globalThis === "undefined") {
  Object.defineProperty(window, "globalThis", {
    value: window,
    configurable: true,
    writable: true
  });
}
if (typeof window.queueMicrotask !== "function") {
  var multiCamResolvedMicrotask = Promise.resolve();
  window.queueMicrotask = function (callback) {
    if (typeof callback !== "function") {
      throw new TypeError("queueMicrotask requires a function");
    }
    multiCamResolvedMicrotask.then(callback).catch(function (error) {
      setTimeout(function () { throw error; }, 0);
    });
  };
}

// WebView 69 also predates Object.fromEntries (Chrome 73). EditorPro builds
// its color and transition maps at module evaluation, before its first paint.
if (typeof Object.fromEntries !== "function") {
  Object.fromEntries = function (entries) {
    var result = {};
    for (var pair of entries) {
      Object.defineProperty(result, pair[0], {
        value: pair[1],
        writable: true,
        configurable: true,
        enumerable: true
      });
    }
    return result;
  };
}
