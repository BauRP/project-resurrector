/**
 * A passive, one-shot responsiveness probe for Android tab navigation.
 * A requestAnimationFrame callback does not prove hardware composition,
 * but a missing callback while JS timers still run is useful evidence.
 * No recording/camera state, DOM style or storage is accessed.
 */
export function monitorNavigationFrame(
  tab: string,
  onSlow: (report: string) => void,
  options: { deadlineMs?: number; slowMs?: number } = {},
): () => void {
  const slowMs = options.slowMs ?? 650;
  const deadlineMs = options.deadlineMs ?? 2000;
  const start = performance.now();
  let finished = false;
  let frame = 0;
  const cancel = () => {
    if (finished) return;
    finished = true;
    if (frame && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    clearTimeout(deadline);
  };
  const deadline = setTimeout(() => {
    if (finished) return;
    const elapsed = Math.round(performance.now() - start);
    cancel();
    if (!document.hidden) onSlow(`tab ${tab}: rAF absent for ${elapsed}ms; JS timer alive`);
  }, deadlineMs);
  if (typeof requestAnimationFrame === "function") {
    frame = requestAnimationFrame(() => {
      if (finished) return;
      const elapsed = Math.round(performance.now() - start);
      cancel();
      if (!document.hidden && elapsed >= slowMs)
        onSlow(`tab ${tab}: rAF delayed ${elapsed}ms; JS timer alive`);
    });
  }
  return cancel;
}
