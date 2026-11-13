import { scheduleAfterResponsivePaint } from "./after-paint-task";

/**
 * Start the full-quality waveform decoder only when the Editor has completed
 * its first paint and the WebView event loop is making steady progress.
 * Audio/video tracks, editing operations and waveforms remain unchanged.
 *
 * Unlike Promise.race timeouts around decodeAudioData, aborting or navigating
 * away here cancels work BEFORE it allocates a large PCM decoder. Recheck
 * stable frames for every clip, so dozens of waveforms don't start in a
 * continuous run that monopolizes an emulator's Chromium renderer.
 */
export function waitForEditorResponsiveIdle(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  if (typeof window === "undefined") return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelFrames: (() => void) | null = null;
    const finish = (ready: boolean) => {
      if (done) return;
      done = true;
      if (timer !== null) clearTimeout(timer);
      cancelFrames?.();
      signal?.removeEventListener("abort", onAbort);
      document.removeEventListener("visibilitychange", onVisibility);
      resolve(ready && !signal?.aborted);
    };
    const onAbort = () => finish(false);
    const onVisibility = () => {
      // LDPlayer can falsely report hidden despite real foreground RAFs.
      startFrames();
    };
    const startFrames = () => {
      if (done || signal?.aborted) { finish(false); return; }
      // True background pages never provide a stable RAF sequence.
      cancelFrames?.();
      cancelFrames = scheduleAfterResponsivePaint(() => {
        finish(true);
      }, { stableFrames: 4, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true });
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    document.addEventListener("visibilitychange", onVisibility);
    // Do not compete with editor media metadata and first-frame initialization.
    timer = setTimeout(startFrames, 550);
    if (signal?.aborted) finish(false);
  });
}
