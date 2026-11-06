import type { MeshMessage } from "./mesh";
import { diagnosticCaptureGate } from "./diagnostic-capture-gate";
import type { MulticamState } from "./multicam-store";

/** A network command only REQUESTS recording; MediaRecorder.onstart is the
 * sole confirmation of an active capture. The original director is pinned
 * until a deliberate new pairing or role change.
 */
type CaptureState = Pick<MulticamState, "role" | "tab" | "captureKind" |
  "recording" | "recordingPhase">;
type CapturePatch = Partial<Pick<MulticamState, "recording" |
  "recordingPhase" | "recordingStartedAt" | "paused" | "captureSaveError">>;

export const REMOTE_DIRECTOR_LOST_REASON =
  "Связь с управляющим телефоном потеряна во время записи; текущий сегмент завершается, непрерывность не подтверждена.";

export class RemoteRecordGuard {
  private directorId: string | null = null;
  private lastTimestamp = -1;
  private disconnectReported = false;

  reset(): void {
    this.directorId = null;
    this.lastTimestamp = -1;
    this.disconnectReported = false;
  }

  /** A lost director is an interruption, not permission to silently resume.
   * Keep the pinned director ID and sequence until an explicit re-pairing.
   */
  onDirectorDisconnected(state: CaptureState, connected: (id: string) => boolean): CapturePatch | null {
    if (!this.directorId || this.disconnectReported || state.role !== "slave" ||
        connected(this.directorId) || !state.recording ||
        !["starting", "recording"].includes(state.recordingPhase)) return null;
    this.disconnectReported = true;
    return { recording: false, recordingPhase: "stopping", paused: false,
      captureSaveError: REMOTE_DIRECTOR_LOST_REASON };
  }

  accept(message: MeshMessage, state: CaptureState, knownPeer: boolean): CapturePatch | null {
    if (message.type !== "record" || state.role !== "slave" ||
        state.tab !== "camera" || state.captureKind !== "video" ||
        !knownPeer || !Number.isSafeInteger(message.at) || message.at <= 0 ||
        (this.directorId !== null && message.from !== this.directorId) ||
        message.at <= this.lastTimestamp) return null;

    if (message.on) {
      // Remote director commands cannot preempt an active camera test.
      if (diagnosticCaptureGate.activeOperation() !== null) return null;
      // Never restart a capture that is still preparing, recording or saving.
      if (state.recording || ["starting", "recording", "stopping", "saving"].includes(state.recordingPhase))
        return null;
      this.directorId = message.from;
      this.lastTimestamp = message.at;
      this.disconnectReported = false;
      return { recording: true, recordingPhase: "starting",
        recordingStartedAt: null, paused: false, captureSaveError: "" };
    }

    // A rapid STOP is valid even when the recorder is only starting.
    if (!state.recording || !["starting", "recording"].includes(state.recordingPhase))
      return null;
    this.directorId = message.from;
    this.lastTimestamp = message.at;
    return { recording: false, recordingPhase: "stopping", paused: false };
  }
}
