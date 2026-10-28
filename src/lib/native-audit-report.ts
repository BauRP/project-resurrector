/** User-initiated, anonymized native recording/fold evidence report.
 * Never export camera identifiers, timestamps, file paths/URIs or raw media.
 * Source may be a malformed Android bridge response; validate every field.
 */
export interface NativeAuditHistory {
  entries: Array<Record<string,unknown>>;
  omittedEarlier: number;
  maxEntries: number;
}
function count(value:unknown,cap=100000000): number|null {
  return typeof value==="number" && Number.isSafeInteger(value) &&
    value>=0 && value<=cap ? value:null;
}
function flag(value:unknown):boolean|null {
  return typeof value==="boolean"?value:null;
}
function modeState(value:unknown):string {
  return ["saved","saved_interrupted","interrupted","error"].includes(String(value))
    ?String(value):"unknown";
}
function entrySummary(item:Record<string,unknown>) {
  const width=count(item["width"],8192);
  const height=count(item["height"],8192);
  const fps=count(item["fps"],240);
  const middle=count(item["mp4MiddleProbes"],3);
  const middleOk=count(item["mp4MiddleMatched"],3);
  const fold=count(item["mp4FoldProbes"],8);
  const foldOk=count(item["mp4FoldMatched"],8);
  const validMiddle=middle!==null&&middleOk!==null&&middleOk<=middle;
  const validFold=fold!==null&&foldOk!==null&&foldOk<=fold;
  return {
    result:modeState(item["state"]),
    mode:{width,height,fps},
    media:{
      bytes:count(item["savedBytes"],100000000000),
      videoTrack:flag(item["mp4HasVideoTrack"]),
      audioTrack:flag(item["mp4HasAudioTrack"]),
      firstFrameDecoded:flag(item["mp4FirstFrameDecodable"]),
      tailFrameDecoded:flag(item["mp4TailFrameDecodable"]),
    },
    fold:{
      observations:count(item["foldObservations"]),
      changes:count(item["foldPostureChanges"]),
      geometryOnlyChanges:count(item["foldGeometryOnlyChanges"]),
      checkpointLimitOmissions:count(item["foldCheckpointsOmitted"]),
      postureChangesWhilePaused:count(item["foldChangesWhilePaused"]),
      callbackGaps:count(item["foldNearbyCallbackGaps"]),
      checkpointAuditCompleted:flag(item["mp4CheckpointAuditCompleted"]),
      skippedCheckpoints:count(item["mp4FoldPointsSkipped"],8),
      encodedPtsChecks:count(item["mp4FoldPtsSpanChecks"],8),
      encodedPtsLargeGaps:count(item["mp4FoldPtsLargeGaps"],8),
      maximumEncodedPtsGapMs:count(item["mp4MaxFoldPtsGapMs"],600000),
      middleChecks:validMiddle?{passed:middleOk,total:middle}:null,
      foldChecks:validFold?{passed:foldOk,total:fold}:null,
    },
    stabilization:{
      eisObservations:count(item["recordingEisFrames"]),
      oisObservations:count(item["recordingOisFrames"]),
      offObservations:count(item["recordingStabilizationOffFrames"]),
      unknownObservations:count(item["recordingStabilizationUnknownFrames"]),
    },
  };
}
export function nativeAnonymizedAuditReport(history:NativeAuditHistory):string {
  // Android or a restored history can contain malformed entries. Ignore
  // invalid records instead of crashing the diagnostics UI on export.
  const entries=Array.isArray(history?.entries)
    ? history.entries.filter((item):item is Record<string,unknown> =>
        item!==null && typeof item==="object" && !Array.isArray(item)).slice(-24)
    : [];
  return JSON.stringify({
    format:"multi-cam-pov-native-audit-v1",
    privacy:"No camera identifiers, exact dates, paths, URLs or media.",
    limitations:"CI and sampled MP4 checks are not physical fold acceptance, full-frame continuity or measured visual stabilization.",
    omittedEarlier:count(history?.omittedEarlier)??0,
    entries:entries.map(item=>entrySummary(item)),
  },null,2);
}
