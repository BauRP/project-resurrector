import { waitForPhotoDelay } from "./camera-photo-delay";

/**
 * Capture the same EV -2/0/+2 photo sequence as before, but ensure an
 * exception while setting EV or encoding a frame does not leave the CURRENT
 * camera at the last bracket exposure.
 *
 * Never submit a reset to an obsolete MediaStream after a camera switch or
 * Activity exit. The caller identifies the current stream with isCurrent.
 */
export async function runExposureBracket<T>(
  exposures: readonly number[],
  applyExposure: (ev: number) => Promise<unknown>,
  captureFrame: () => Promise<T | null>,
  signal: AbortSignal,
  isCurrent: () => boolean,
  hasExposureControl = true,
): Promise<T[]> {
  const shots: T[] = [];
  let attemptedExposure = false;
  try {
    for (const exposure of exposures) {
      if (signal.aborted || !isCurrent()) break;
      if (hasExposureControl) {
        // Even if applyExposure throws, a camera may have applied the new EV.
        attemptedExposure = true;
        await applyExposure(exposure);
      }
      if (signal.aborted || !isCurrent()) break;
      if (!(await waitForPhotoDelay(400, signal)) || !isCurrent()) break;
      const frame = await captureFrame();
      if (signal.aborted || !isCurrent()) break;
      if (frame !== null) shots.push(frame);
    }
  } finally {
    if (attemptedExposure && !signal.aborted && isCurrent()) {
      // A failed reset should not hide the original capture error or cause
      // the frame-saving loop to hang on an already failed shooting request.
      try { await applyExposure(0); }
      catch { /* a hardware constraint may already be unavailable */ }
    }
  }
  return shots;
}
