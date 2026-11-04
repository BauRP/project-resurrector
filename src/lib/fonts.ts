/**
 * The full subtitle font catalog is packaged as local WOFF2 files when
 * building Android, never downloaded by a running user's device.
 * The app stylesheet includes /fonts/ assets through the Capacitor build.
 */
export function loadOptionalFonts(): () => void {
  if (typeof document === "undefined" || !("fonts" in document)) return () => {};
  let cancelled = false;
  // Prewarm the first font without blocking initial camera rendering.
  const id = window.setTimeout(() => {
    if (!cancelled) void document.fonts.load("400 14px Montserrat").catch(() => undefined);
  }, 1500);
  return () => { cancelled = true; window.clearTimeout(id); };
}
