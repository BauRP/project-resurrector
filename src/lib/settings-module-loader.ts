/**
 * Android WebView may spend hundreds of milliseconds compiling a lazy Settings
 * chunk and its dependencies on the same renderer that is closing Camera2's
 * video DOM. Cache the import while the app is idle, before navigation.
 *
 * This only fetches/evaluates JavaScript: it does not mount Settings, start
 * Camera2 diagnostics, enumerate IndexedDB or touch project data.
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
