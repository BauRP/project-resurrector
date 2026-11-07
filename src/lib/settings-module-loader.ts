import { Capacitor } from "@capacitor/core";

/**
 * Android WebView may spend hundreds of milliseconds compiling a lazy Settings
 * chunk and its dependencies on the same renderer that is closing Camera2's
 * video DOM. Cache the import while the app is idle, before navigation.
 *
 * In browsers, this only fetches/evaluates JavaScript and never mounts Settings
 * or invokes Camera2. In native WebView, no speculative compile happens during
 * startup: the full module loads on the user's first Settings navigation.
 */
let settingsModulePromise: Promise<typeof import("@/components/multicam/SettingsTab")> | null = null;

export function loadSettingsModule(): Promise<typeof import("@/components/multicam/SettingsTab")> {
  if (!settingsModulePromise) {
    settingsModulePromise = import("@/components/multicam/SettingsTab").catch(error => {
      settingsModulePromise = null; // Allow retry if WebView temporarily fails to load a chunk.
      throw error;
    });
  }
  return settingsModulePromise;
}

export function scheduleSettingsPreload(): () => void {
  if (typeof window === "undefined") return () => undefined;
  // Evidence from emulator #157: SettingsTab chunk fetch at 14:20:52.8
  // overlapped Camera startup while Android MAIN was blocked in
  // HardwareRenderer.nSyncAndDrawFrame for 7.5 seconds. The speculative
  // native compile finished at the first Settings tap, competing with
  // teardown and painting. Keep ALL Settings functions, but never preload
  // the module in a native WebView. Load it after the two-paint entry gate.
  if (Capacitor.isNativePlatform()) return () => undefined;
  let cancelled = false;
  let timer: number | null = null;
  let idle: number | null = null;
  const start = () => {
    timer = null;
    idle = null;
    if (cancelled || document.hidden) return;
    void loadSettingsModule().catch(() => undefined);
  };
  // Defer work until startup and camera preview have had a chance to paint.
  const target = window as Window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  // Starting the lazy Settings import 1.8s after startup overlapped the
  // user's first Settings tap in the real Android freeze logs. Do not compile
  // a large JS chunk while Camera is being torn down and Settings paints.
  // Native WebView enters this warmup later; actual navigation can cancel it.
  timer = window.setTimeout(() => {
    if (cancelled) return;
    if (typeof target.requestIdleCallback === "function")
      idle = target.requestIdleCallback(start, { timeout: 4000 });
    else start();
  }, 3500);
  const cancel = () => {
    cancelled = true;
    if (timer !== null) window.clearTimeout(timer);
    if (idle !== null) target.cancelIdleCallback?.(idle);
  };
  const onNavigation = () => cancel();
  window.addEventListener("multicam-settings-navigation-start", onNavigation, { once: true });
  return () => {
    window.removeEventListener("multicam-settings-navigation-start", onNavigation);
    cancel();
  };
}
