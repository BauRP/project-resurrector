/** Decide if a timeline waveform attempt should be retried on the NEXT
 * editor/timeline change, never in the current decoder pass.
 * A deliberately skipped too-large video is an empty successful result, and
 * must not start infinite full-file PCM reads in the same session.
 */
export function editorWaveformDecision(
  peaks: readonly number[] | null | undefined,
  cancelled: boolean,
): "cancel" | "retry" | "done" {
  if (cancelled) return "cancel";
  if (peaks == null) return "retry";
  return "done";
}
