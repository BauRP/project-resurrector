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
