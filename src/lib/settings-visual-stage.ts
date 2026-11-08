import { Capacitor } from "@capacitor/core";
import { scheduleAfterResponsivePaint } from "./after-paint-task";
import { uiFreeze } from "./ui-freeze-bridge";

/** Each heavy Settings stage starts only after the Android WebView renderer
 * confirms the preceding scene reached its compositor. A JavaScript rAF alone
 * cannot prove that HardwareRenderer.syncAndDrawFrame has completed.
 * Feature panels are postponed, never removed or disabled.
 */
export function scheduleSettingsVisualStage(
  task: () => void,
  options: { stableFrames?: number; maxFrameGapMs?: number; backgroundFallbackMs?: number } = {},
): () => void {
  let alive = true;
  let completed = false;
  let cancelFrames: (() => void) | null = null;
  let retry: ReturnType<typeof setTimeout> | null = null;
  const config = {
    stableFrames: options.stableFrames ?? 4,
    maxFrameGapMs: options.maxFrameGapMs ?? 125,
    backgroundFallbackMs: options.backgroundFallbackMs ?? 1800,
  };
  const finish = () => {
    if (!alive || completed) return;
    completed = true;
    task();
  };
  const check = () => {
    if (!alive || completed) return;
    cancelFrames = scheduleAfterResponsivePaint(() => {
      if (!alive || completed) return;
      if (!Capacitor.isNativePlatform() || document.hidden ||
          !Capacitor.isPluginAvailable("UiFreeze")) {
        finish();
        return;
      }
      void uiFreeze.awaitVisualState().then(result => {
        if (!alive || completed) return;
        if (!result.ready) {
          retry = setTimeout(check, 900);
          return;
        }
        cancelFrames = scheduleAfterResponsivePaint(finish, {
          stableFrames: 2, maxFrameGapMs: config.maxFrameGapMs,
          backgroundFallbackMs: config.backgroundFallbackMs,
        });
      }).catch(() => {
        if (!alive || completed) return;
        cancelFrames = scheduleAfterResponsivePaint(finish, {
          stableFrames: 5, maxFrameGapMs: config.maxFrameGapMs,
          backgroundFallbackMs: config.backgroundFallbackMs,
        });
      });
    }, config);
  };
  check();
  return () => {
    alive = false;
    cancelFrames?.();
    if (retry !== null) clearTimeout(retry);
  };
}
