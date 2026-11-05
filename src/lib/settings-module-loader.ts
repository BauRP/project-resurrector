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
  timer = window.setTimeout(() => {
    if (cancelled) return;
    if (typeof target.requestIdleCallback === "function")
      idle = target.requestIdleCallback(start, { timeout: 4000 });
    else start();
  }, 1800);
  return () => {
    cancelled = true;
    if (timer !== null) window.clearTimeout(timer);
    if (idle !== null) target.cancelIdleCallback?.(idle);
  };
}
