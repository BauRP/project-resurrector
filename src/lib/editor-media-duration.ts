/**
 * Browser-recorded WebM on old Android WebViews may report duration=Infinity
 * even though it is a finite local file. Use a finite browser duration first;
 * otherwise use the original capture duration, seekable end or completed
 * seek result. No fake defaults: unresolvable media stays a real error.
 */
const MAX_EDITOR_SECONDS = 24 * 60 * 60;
const valid = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) &&
  value > 0 && value <= MAX_EDITOR_SECONDS;

export function selectEditorClipDuration(
  reportedDuration: number,
  recordedDuration?: number,
  seekableEnd?: number,
  completedSeekTime?: number,
): number | null {
  if (valid(reportedDuration)) return reportedDuration;
  if (valid(recordedDuration)) return recordedDuration;
  if (valid(seekableEnd)) return seekableEnd;
  if (valid(completedSeekTime)) return completedSeekTime;
  return null;
}
