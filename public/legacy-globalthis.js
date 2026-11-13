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
