// Android 9 emulator WebView 69 lacks the ES2020 globalThis binding.
// This is a classic, parser-blocking script executed before Vite modules.
if (typeof window.globalThis === "undefined") {
  Object.defineProperty(window, "globalThis", {
    value: window,
    configurable: true,
    writable: true
  });
}
