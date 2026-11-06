/** Async native Camera2 status responses may arrive after a fold remount,
 * a new recording command, or a MediaRecorder finalization. In those states
 * never transfer ownership between the native and WebView camera pipelines.
 */
export function mayFinishCameraOwnerSwitch(
  mounted: boolean, recording: boolean, phase: string,
): boolean {
  return mounted && !recording &&
    !["starting", "recording", "stopping", "saving"].includes(phase);
}
