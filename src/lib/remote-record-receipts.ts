import { recordStatusOrder, type RemoteRecordStatus } from "./mesh";

/** A network START/STOP receipt confirms validation only. Recorder progress
 * is published after the actual MediaRecorder / durable clip state changes.
 * Never promote a stale lower phase to a newer success or error.
 */
export function nextRemoteReceiptStatus(
  previouslyReported: RemoteRecordStatus,
  recorderPhase: string,
): RemoteRecordStatus | null {
  const candidate:RemoteRecordStatus | null =
    recorderPhase === "recording" ? "recording" :
    recorderPhase === "stopping" ? "stopping" :
    recorderPhase === "saved" ? "saved" :
    recorderPhase === "error" ? "error" : null;
  if (!candidate || recordStatusOrder(candidate) <= recordStatusOrder(previouslyReported))
    return null;
  return candidate;
}
