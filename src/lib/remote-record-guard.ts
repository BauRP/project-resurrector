import type { MeshMessage } from "./mesh";
import type { MulticamState } from "./multicam-store";

/** A network command only REQUESTS recording; MediaRecorder.onstart is the
 * sole confirmation of an active capture. The original director is pinned
 * until a deliberate new pairing or role change.
 */
type CaptureState = Pick<MulticamState, "role" | "tab" | "captureKind" |
  "recording" | "recordingPhase">;
type CapturePatch = Partial<Pick<MulticamState, "recording" |
  "recordingPhase" | "recordingStartedAt" | "paused" | "captureSaveError">>;

export class RemoteRecordGuard {
  private directorId: string | null = null;
  private lastTimestamp = -1;

  reset(): void {
    this.directorId = null;
    this.lastTimestamp = -1;
  }

  accept(message: MeshMessage, state: CaptureState, knownPeer: boolean): CapturePatch | null {
    if (message.type !== "record" || state.role !== "slave" ||
        state.tab !== "camera" || state.captureKind !== "video" ||
        !knownPeer || !Number.isSafeInteger(message.at) || message.at <= 0 ||
        (this.directorId !== null && message.from !== this.directorId) ||
        message.at <= this.lastTimestamp) return null;

    if (message.on) {
      // Never restart a capture that is still preparing, recording or saving.
      if (state.recording || ["starting", "recording", "stopping", "saving"].includes(state.recordingPhase))
        return null;
      this.directorId = message.from;
      this.lastTimestamp = message.at;
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
