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
      tailAudioSamples:count(item["mp4TailAudioSamples"],512),
      audioPtsAnomalies:count(item["mp4AudioPtsAnomalies"],1024),
      tailAudioNearEnd:flag(item["mp4TailAudioNearEnd"]),
      avTailOffsetMeasured:flag(item["mp4AvTailOffsetMeasured"]),
      avTailOffsetMs:typeof item["mp4AvTailOffsetMs"]==="number" && Number.isSafeInteger(item["mp4AvTailOffsetMs"]) && Math.abs(item["mp4AvTailOffsetMs"])<=600000 ? item["mp4AvTailOffsetMs"]:null,
      firstFrameDecoded:flag(item["mp4FirstFrameDecodable"]),
      tailFrameDecoded:flag(item["mp4TailFrameDecodable"]),
      avDriftMeasured:flag(item["mp4AvDriftMeasured"]),
      avDriftMs:typeof item["mp4AvDriftMs"]==="number" && Number.isSafeInteger(item["mp4AvDriftMs"]) && Math.abs(item["mp4AvDriftMs"])<=600000 ? item["mp4AvDriftMs"]:null,
      audioTimelineCompleted:flag(item["mp4AudioTimelineCompleted"]),
      audioTimelineTrackFound:flag(item["mp4AudioTimelineTrackFound"]),
      audioTimelineSamples:count(item["mp4AudioTimelineSamples"],180000),
      audioTimelineRollbacks:count(item["mp4AudioTimelineRollbacks"],180000),
      audioTimelineDuplicates:count(item["mp4AudioTimelineDuplicates"],180000),
      audioTimelineLargeGaps:count(item["mp4AudioTimelineLargeGaps"],180000),
      audioTimelineMaxGapMs:count(item["mp4AudioTimelineMaxGapMs"],600000),
      timelineLimitReason:typeof item["mp4TimelineLimitReason"]==="string" && ["completed","sample_limit","time_limit","too_short","missing_track","extractor_error","not_checked"].includes(item["mp4TimelineLimitReason"]) ? item["mp4TimelineLimitReason"]:null,
      audioTimelineLimitReason:typeof item["mp4AudioTimelineLimitReason"]==="string" && ["completed","sample_limit","time_limit","too_short","missing_track","extractor_error","not_requested"].includes(item["mp4AudioTimelineLimitReason"]) ? item["mp4AudioTimelineLimitReason"]:null,
      timelineMeasuredFps:typeof item["mp4TimelineSampledFps"]==="number" && Number.isFinite(item["mp4TimelineSampledFps"]) && item["mp4TimelineSampledFps"]>0 && item["mp4TimelineSampledFps"]<=240 ? item["mp4TimelineSampledFps"]:null,
      timelineCompleted:flag(item["mp4TimelineCompleted"]),
      cameraCaptureFailureEvents:count(item["cameraCaptureFailureEvents"],100000),
      foldNearbyCaptureFailureEvents:count(item["foldNearbyCaptureFailureEvents"],100000),
      cameraCallbackStallEpisodes:count(item["cameraCallbackStallEpisodes"],100000),
      maxCameraCallbackSilenceMs:count(item["maxCameraCallbackSilenceMs"],600000),
      lowFpsWindows:count(item["mp4LowFpsWindows"],120000),
      timelineSamples:count(item["mp4TimelineSamples"],120000),
      timelineRollbacks:count(item["mp4TimelineRollbacks"],120000),
      timelineDuplicates:count(item["mp4TimelineDuplicates"],120000),
      timelineLargeGaps:count(item["mp4TimelineLargeGaps"],120000),
      timelineMaxGapMs:count(item["mp4TimelineMaxGapMs"],600000),
    },
    fold:{
      observations:count(item["foldObservations"]),
      changes:count(item["foldPostureChanges"]),
      geometryOnlyChanges:count(item["foldGeometryOnlyChanges"]),
      checkpointLimitOmissions:count(item["foldCheckpointsOmitted"]),
      postureChangesWhilePaused:count(item["foldChangesWhilePaused"]),
      observerGap:flag(item["foldObserverGap"]),
      callbackGaps:count(item["foldNearbyCallbackGaps"]),
      checkpointAuditCompleted:flag(item["mp4CheckpointAuditCompleted"]),
      skippedCheckpoints:count(item["mp4FoldPointsSkipped"],8),
      encodedPtsChecks:count(item["mp4FoldPtsSpanChecks"],8),
      audioPtsChecks:count(item["mp4FoldAudioPtsSpanChecks"],8),
      audioPtsLargeGaps:count(item["mp4FoldAudioPtsLargeGaps"],8),
      maximumAudioPtsGapMs:count(item["mp4MaxFoldAudioPtsGapMs"],600000),
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
