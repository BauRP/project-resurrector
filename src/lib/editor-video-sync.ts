/**
 * Decoder correction should not trigger a seek on every UI frame.
 * The 280ms synchronization bound is retained; large explicit timeline jumps
 * still seek immediately, while persistent lag is corrected at most ~1.5/s.
 * Original tracks, quality, speed and timeline position remain unchanged.
 */
export function shouldCorrectPlayingVideo(
  actual: number,
  desired: number,
  previousDesired: number | null,
  seeking: boolean,
  nowMs: number,
  lastCorrectionMs: number,
): boolean {
  if (!Number.isFinite(actual) || !Number.isFinite(desired) || seeking) return false;
  if (Math.abs(actual - desired) <= 0.28) return false;
  const userJump = previousDesired !== null &&
    Number.isFinite(previousDesired) && Math.abs(desired - previousDesired) > 0.35;
  return userJump || nowMs - lastCorrectionMs >= 650;
}

/** An asynchronous play() may settle after the user paused a preview. */
export function pauseVideoAfterLatePlay(
  video: Pick<HTMLVideoElement, "paused" | "pause">,
  playbackStillWanted: boolean,
): void {
  if (!playbackStillWanted && !video.paused) video.pause();
}
