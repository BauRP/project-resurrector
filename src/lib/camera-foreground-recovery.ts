import { isCameraSwitchBlocked } from "./camera-device-switch";

/** A fold or Android background event can revoke the WebView camera track
 * without remounting the React screen. Reopen preview only after the recorder
 * has finished finalization. This never authorizes starting a new recording.
 */
export interface ForegroundPreviewStatus {
  visible: boolean;
  recording: boolean;
  phase: "idle" | "starting" | "recording" | "stopping" | "saving" | "saved" | "error";
  preview: "loading" | "live" | "unavailable";
  stream: Pick<MediaStream, "getVideoTracks"> | null;
  selectedDeviceMissing: boolean;
}

export function mayRecoverForegroundPreview(status: ForegroundPreviewStatus): boolean {
  if (!status.visible || status.selectedDeviceMissing ||
      isCameraSwitchBlocked(status.recording, status.phase) ||
      status.preview === "loading") return false;
  let liveTrack = false;
  try {
    liveTrack = !!status.stream?.getVideoTracks().some(track => track.readyState === "live");
  } catch { /* lost or invalidated WebView stream */ }
  return status.preview === "unavailable" || !liveTrack;
}

/** A pending foreground intent is consumed once per actual return, never
 * repeatedly on every React render. Leave it pending through finalization.
 */
export class ForegroundReturnEpoch {
  private pending = false;
  markReturned(): void { this.pending = true; }
  hasPending(): boolean { return this.pending; }
  consumeWhenReady(status: ForegroundPreviewStatus): boolean {
    if (!this.pending || !status.visible || status.preview === "loading" ||
        isCameraSwitchBlocked(status.recording, status.phase)) return false;
    this.pending = false;
    return mayRecoverForegroundPreview(status);
  }
}
