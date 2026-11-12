/** Schedule non-urgent synchronous work after the next visible paint.
 * A cancelled RAF (hidden Android WebView) must not lose saved editor state,
 * so a bounded fallback runs even when Chromium stops producing frames.
 * pagehide callers still explicitly flush their latest snapshot.
 */
export function scheduleAfterPaintTask(task: () => void, fallbackMs = 450): () => void {
  let finished = false;
  let frame = 0;
  let afterFrame: ReturnType<typeof setTimeout> | null = null;
  const cleanup = () => {
    if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    frame = 0;
    if (afterFrame !== null) clearTimeout(afterFrame);
    clearTimeout(fallback);
  };
  const fire = () => {
    if (finished) return;
    finished = true;
    cleanup();
    task();
  };
  const fallback = setTimeout(fire, fallbackMs);
  if (typeof requestAnimationFrame === "function") {
    // Two frame boundaries let the old media DOM detach before blocking
    // localStorage work. The zero-delay task follows the second RAF callback.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        afterFrame = setTimeout(fire, 0);
      });
    });
  }
  return () => {
    if (finished) return;
    finished = true;
    cleanup();
  };
}

/** Wait for actual responsive animation-frame cadence before mounting GPU-heavy
 * screens. Unlike persistence scheduling, a visible stalled renderer must NOT
 * force-mount another screen just because a fallback timer expired. Native
 * recovery remains available if the renderer is truly stuck.
 * Hidden WebViews (which intentionally suppress RAF) retain a bounded fallback
 * unless the caller is a heavy screen that must wait for the next foreground.
 */
export function scheduleAfterResponsivePaint(
  task: () => void,
  options: { stableFrames?: number; maxFrameGapMs?: number; backgroundFallbackMs?: number; visibleOnly?: boolean } = {},
): () => void {
  const targetFrames = Math.max(2, options.stableFrames ?? 3);
  const maxGap = options.maxFrameGapMs ?? 125;
  const backgroundFallbackMs = options.backgroundFallbackMs ?? 1800;
  // Never mount GPU-heavy Camera2/media panels while Android has hidden this
  // WebView. Persistence callers keep their existing background fallback.
  const visibleOnly = options.visibleOnly ?? false;
  let finished = false;
  let frame = 0;
  let settled: ReturnType<typeof setTimeout> | null = null;
  let fallback: ReturnType<typeof setTimeout> | null = null;
  let lastFrame: number | null = null;
  let stable = 0;
  const clearScheduled = () => {
    if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    frame = 0;
    if (settled !== null) clearTimeout(settled);
    if (fallback !== null) clearTimeout(fallback);
    settled = null;
    fallback = null;
  };
  const cancel = () => {
    if (finished) return;
    finished = true;
    clearScheduled();
    document.removeEventListener("visibilitychange", onVisibility);
  };
  const finish = () => {
    if (finished) return;
    if (visibleOnly && document.hidden) {
      armBackground();
      return;
    }
    cancel();
    task();
  };
  const armBackground = () => {
    clearScheduled();
    if (!visibleOnly) fallback = setTimeout(finish, backgroundFallbackMs);
  };
  const tick = (now: number) => {
    frame = 0;
    if (finished) return;
    if (document.hidden) { armBackground(); return; }
    if (lastFrame !== null && now > lastFrame && now - lastFrame <= maxGap) stable += 1;
    else stable = 1;
    lastFrame = now;
    if (stable >= targetFrames) {
      // Leave the painting phase before starting Settings or forcing scroll.
      settled = setTimeout(finish, 0);
    } else {
      frame = requestAnimationFrame(tick);
    }
  };
  const armVisible = () => {
    clearScheduled();
    stable = 0;
    lastFrame = null;
    if (typeof requestAnimationFrame !== "function") {
      // Browsers without RAF still get their working panel when foregrounded.
      fallback = setTimeout(finish, backgroundFallbackMs);
    } else frame = requestAnimationFrame(tick);
  };
  function onVisibility() {
    if (finished) return;
    if (document.hidden) armBackground();
    else armVisible();
  }
  document.addEventListener("visibilitychange", onVisibility);
  if (document.hidden) armBackground();
  else armVisible();
  return cancel;
}
