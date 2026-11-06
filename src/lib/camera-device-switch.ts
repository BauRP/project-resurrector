/** A WebView MediaRecorder owns its camera stream until the file has been saved.
 * A selector may change in the UI, but the active stream must not be recreated.
 * Recording phase, rather than screen size or fold posture, is authoritative.
 */
export function isCameraSwitchBlocked(
  recording: boolean,
  phase: "idle" | "starting" | "recording" | "stopping" | "saving" | "saved" | "error",
): boolean {
  return recording || phase === "starting" || phase === "recording" ||
    phase === "stopping" || phase === "saving";
}
