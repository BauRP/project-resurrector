/** An opt-in, privacy-safe native recording/fold diagnostic report.
 * It intentionally excludes paths, URIs, camera IDs, timestamps and messages
 * that may contain local file names or identifying details.
 */
export type NativeAuditHistory = {
  entries: Array<Record<string,unknown>>;
  omittedEarlier:number;
  maxEntries:number;
};
const bounded=(value:unknown,max:number):number|null=>
  typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=max?value:null;
const validState=(value:unknown):string=>
  ["saved","saved_interrupted","interrupted","error"].includes(String(value))?String(value):"unknown";
export function redactNativeAudit(history:NativeAuditHistory){
 const entries=history.entries.slice(-24).map(row=>({
  result:validState(row["state"]),
  requestedSize: [bounded(row["width"],8192),bounded(row["height"],8192)],
  requestedFps:bounded(row["fps"],240),
  videoBytes:bounded(row["savedBytes"],Number.MAX_SAFE_INTEGER),
  hasVideoTrack:row["mp4HasVideoTrack"]===true,
  hasAudioTrack:row["mp4HasAudioTrack"]===true,
  firstFrameDecodable:row["mp4FirstFrameDecodable"]===true,
  tailFrameDecodable:row["mp4TailFrameDecodable"]===true,
  foldPostureChanges:bounded(row["foldPostureChanges"],100000),
  foldCheckpointTests:bounded(row["mp4FoldProbes"],8),
  foldCheckpointPassed:bounded(row["mp4FoldMatched"],8),
  middleCheckpointTests:bounded(row["mp4MiddleProbes"],3),
  middleCheckpointPassed:bounded(row["mp4MiddleMatched"],3),
  eisObservations:bounded(row["recordingEisFrames"],10000000),
  oisObservations:bounded(row["recordingOisFrames"],10000000),
  unknownStabilizationObservations:bounded(row["recordingStabilizationUnknownFrames"],10000000),
 }));
 return {
   schema:"multicam-native-anonymous-audit-v1",
   disclaimer:"Partial Camera2 and MP4 evidence. No full-file or real-device folding continuity certification.",
   entries,
   omittedEarlier:bounded(history.omittedEarlier,10000000),
 };
}
export function nativeAuditExportText(history:NativeAuditHistory):string {
 return JSON.stringify(redactNativeAudit(history),null,2);
}
