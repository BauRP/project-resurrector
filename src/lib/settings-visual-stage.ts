import { scheduleAfterResponsivePaint } from "./after-paint-task";

/**
 * The Settings entry gate waits for responsive browser frames but makes no mandatory native GPU calls
 * after retiring the Camera / Editor. Calling postVisualStateCallback and
 * invalidating the Android WebView again for EACH subsequent Settings group
 * adds repeated GPU frames exactly while older emulators stall.
 *
 * Later groups retain their separate delays and must observe a sustained,
 * responsive JS frame cadence, including low-FPS software WebViews. If the visible renderer is blocked they
 * cannot mount. A truly hidden WebView waits for foreground frame delivery
 * instead of mounting optional Camera2 and network controls from a timer.
 * An emulator falsely reporting "hidden" still proceeds on healthy frames.
 * Camera2, network, privacy, and cache features are unchanged.
 */
export function scheduleSettingsVisualStage(
  task: () => void,
  options: { stableFrames?: number; maxFrameGapMs?: number; backgroundFallbackMs?: number } = {},
): () => void {
  return scheduleAfterResponsivePaint(task, {
    stableFrames: options.stableFrames ?? 4,
    maxFrameGapMs: options.maxFrameGapMs ?? 350,
    backgroundFallbackMs: options.backgroundFallbackMs ?? 1800,
    visibleOnly: true,
  });
}
