import {describe,it,expect} from "vitest";
import {nativeRecordedModeEvidence} from "./native-recorded-mode-evidence";
const base={state:"saved",message:"",startedAt:1,stabilization:"unknown",stabilizationCaptureResultObserved:false,
 savedBytes:100000,savedUri:"",videoOnly:false,cameraId:"rear-0",width:1920,height:1080,fps:30,
 mp4TracksInspected:true,mp4HasVideoTrack:true,mp4HasAudioTrack:true,mp4FirstFrameDecodable:true,
 mp4VideoWidth:1920,mp4VideoHeight:1080,mp4VideoSamples:140,mp4AudioSamples:120,audioRequested:true,
 mp4TailAudioSamples:120,mp4TailAudioNearEnd:true,mp4AvTailOffsetMeasured:true,mp4AvTailOffsetMs:50};
describe("native Camera2 per-mode recorded evidence",()=>{
 it("records valid native MP4 evidence but does not claim full verification",()=>{
  const r=nativeRecordedModeEvidence(base,12345);
  expect(r?.api).toBe("camera2");
  expect(r?.state).toBe("recorded");
  expect(r?.file?.bytes).toBe(100000);
  expect(r?.message).toContain("не подтверждены");
 });
 it("keeps measured recording EIS/OIS separate from visual stabilization proof",()=>{
  const observed=nativeRecordedModeEvidence({...base,recordingEisFrames:72,
    recordingOisFrames:0,recordingStabilizationOffFrames:0,
    recordingStabilizationUnknownFrames:8},12345);
  expect(observed?.message).toContain("72/0/0/8");
  expect(observed?.message).toContain("не подтверждены");
  const absent=nativeRecordedModeEvidence({...base,recordingEisFrames:0},12345);
  expect(absent?.message).toContain("неизвестно");
 });
 it("does not fabricate success on missing audio, decoder or damaged timing",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4AudioSamples:0},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FirstFrameDecodable:false},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4VideoTimestampDuplicates:2},12345)?.state).toBe("unknown");
 });
 it("marks a measured MP4 FPS mismatch as unconfirmed, not verified 60fps",()=>{
  expect(nativeRecordedModeEvidence({...base,fps:60,mp4SampledFps:24,mp4TailSampledFps:24},12345)?.state)
    .toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,fps:30,mp4SampledFps:29.7,mp4TailSampledFps:30.2},12345)?.state)
    .toBe("recorded");
  expect(nativeRecordedModeEvidence({...base,fps:30,mp4SampledFps:-1,mp4TailSampledFps:-1},12345)?.state)
    .toBe("recorded");
 });
 it("does not certify a long MP4 if its tail cannot decode",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4DurationMs:10000,mp4TailFrameDecodable:false},12345)?.state)
    .toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4DurationMs:10000,mp4TailVideoSamples:90,
    mp4TailNearEnd:true,mp4TailFrameDecodable:true},12345)?.state)
    .toBe("recorded");
  expect(nativeRecordedModeEvidence({...base,mp4DurationMs:1000,mp4TailFrameDecodable:false},12345)?.state)
    .toBe("recorded");
 });
 it("does not certify failed middle or real fold checkpoints",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4MiddleProbes:3,mp4MiddleMatched:2},12345)?.state)
    .toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4MiddleProbes:3,mp4MiddleMatched:3,
    mp4FoldProbes:2,mp4FoldMatched:1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4MiddleProbes:3,mp4MiddleMatched:3,
    mp4FoldProbes:2,mp4FoldMatched:2,mp4FoldPtsSpanChecks:2,mp4FoldAudioPtsSpanChecks:2},12345)?.state).toBe("recorded");
  expect(nativeRecordedModeEvidence({...base,mp4FoldProbes:0,mp4FoldMatched:0},12345)?.message)
    .toContain("не подтверждены");
 });
 it("rejects impossible checkpoint counts rather than trusting corrupted evidence",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4MiddleProbes:3,mp4MiddleMatched:4},12345)?.state)
    .toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FoldProbes:9,mp4FoldMatched:9},12345)?.state)
    .toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FoldProbes:-1,mp4FoldMatched:0},12345)?.state)
    .toBe("unknown");
 });
 it("never accepts a fractional or missing actual MP4 frame count",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4VideoSamples:0.5},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4VideoSamples:0},12345)?.state).toBe("unknown");
 });
 it("downgrades real MP4 fold PTS gaps without claiming all frames lost",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4FoldPtsSpanChecks:2,mp4FoldPtsLargeGaps:1,mp4MaxFoldPtsGapMs:500},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FoldProbes:2,mp4FoldMatched:2,mp4FoldPtsSpanChecks:2,mp4FoldAudioPtsSpanChecks:2,mp4FoldPtsLargeGaps:0,mp4MaxFoldPtsGapMs:40},12345)?.state).toBe("recorded");
 });
 it("rejects impossible or contradictory encoded fold PTS gap counts",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4FoldPtsSpanChecks:2,mp4FoldPtsLargeGaps:3},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FoldPtsSpanChecks:-1,mp4FoldPtsLargeGaps:0},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FoldPtsSpanChecks:1,mp4FoldPtsLargeGaps:0,mp4MaxFoldPtsGapMs:-20},12345)?.state).toBe("unknown");
 });
 it("does not call a fold recording confirmed when local MP4 bracketing PTS could not be read",()=>{
  const r=nativeRecordedModeEvidence({...base,mp4FoldProbes:2,mp4FoldMatched:2,
    mp4FoldPtsSpanChecks:1,mp4FoldAudioPtsSpanChecks:2,mp4FoldPtsLargeGaps:0},12345);
  expect(r?.state).toBe("unknown");
  expect(r?.message).toContain("не удалось проверить");
 });
 it("never certifies MP4 with fold checkpoints skipped at file boundaries",()=>{
  const result=nativeRecordedModeEvidence({...base,mp4CheckpointAuditCompleted:true,
    mp4FoldPointsSkipped:1,mp4FoldProbes:0,mp4FoldPtsSpanChecks:0},12345);
  expect(result?.state).toBe("unknown");
  expect(result?.message).toContain("пропущена");
  expect(nativeRecordedModeEvidence({...base,mp4FoldPointsSkipped:-1},12345)?.state).toBe("unknown");
 });
 it("does not claim MP4 fold continuity when more than eight positions occurred",()=>{
  const report=nativeRecordedModeEvidence({...base,mp4CheckpointAuditCompleted:true,
    foldCheckpointsOmitted:3,mp4FoldProbes:8,mp4FoldMatched:8,
    mp4FoldPtsSpanChecks:8,mp4FoldAudioPtsSpanChecks:8},12345);
  expect(report?.state).toBe("unknown");
  expect(report?.message).toContain("восемью точками");
  expect(nativeRecordedModeEvidence({...base,foldCheckpointsOmitted:-2},12345)?.state).toBe("unknown");
 });
 it("cannot confirm a recording when native checkpoint scanning aborted",()=>{
  const failure=nativeRecordedModeEvidence({...base,mp4CheckpointAuditCompleted:false},12345);
  expect(failure?.state).toBe("unknown");
  expect(failure?.message).toContain("не завершена");
  expect(nativeRecordedModeEvidence({...base,mp4CheckpointAuditCompleted:true},12345)?.state).toBe("recorded");
 });
 it("rejects transposed encoded dimensions: orientation metadata is not track size",()=>{
  const result=nativeRecordedModeEvidence({...base,mp4VideoWidth:1080,mp4VideoHeight:1920},12345);
  expect(result?.state).toBe("unknown");
  expect(result?.message).toContain("разрешение");
 });
 it("does not certify long MP4 with missing tail samples even if a keyframe decodes",()=>{
  const missing=nativeRecordedModeEvidence({...base,mp4DurationMs:12000,
    mp4TailFrameDecodable:true,mp4TailVideoSamples:0,mp4TailNearEnd:false},12345);
  expect(missing?.state).toBe("unknown");
  expect(missing?.message).toContain("возле конца");
  expect(nativeRecordedModeEvidence({...base,mp4DurationMs:12000,
    mp4TailFrameDecodable:true,mp4TailVideoSamples:90,mp4TailNearEnd:true},12345)?.state)
    .toBe("recorded");
 });
 it("does not call a fold-capture complete after Activity observer gap",()=>{
  const r=nativeRecordedModeEvidence({...base,foldObserverGap:true},12345);
  expect(r?.state).toBe("unknown");
  expect(r?.message).toContain("Наблюдение за складыванием прерывалось");
 });
 it("requires explicit measured MP4 tail evidence on long videos",()=>{
  const baseLong={...base,mp4DurationMs:12000,mp4TailFrameDecodable:true};
  expect(nativeRecordedModeEvidence(baseLong,12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...baseLong,mp4TailVideoSamples:90},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...baseLong,mp4TailNearEnd:true},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...baseLong,mp4TailVideoSamples:90,
    mp4TailNearEnd:true},12345)?.state).toBe("recorded");
 });
 it("rejects long MP4 with sound only at its beginning",()=>{
  const good={...base,mp4DurationMs:12000,mp4TailFrameDecodable:true,
    mp4TailVideoSamples:90,mp4TailNearEnd:true};
  expect(nativeRecordedModeEvidence({...good,mp4TailAudioSamples:0},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...good,mp4TailAudioNearEnd:false},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...good,mp4AvTailOffsetMeasured:false},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...good,mp4AvTailOffsetMs:2400},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...good,audioRequested:false},12345)?.state).toBe("recorded");
  expect(nativeRecordedModeEvidence(good,12345)?.state).toBe("recorded");
 });
 it("rejects invalid or duplicated audio timestamps in a requested sound track",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4AudioPtsAnomalies:2},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4AudioPtsAnomalies:-1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4AudioPtsAnomalies:0},12345)?.state).toBe("recorded");
  expect(nativeRecordedModeEvidence({...base,audioRequested:false,mp4AudioPtsAnomalies:2},12345)?.state).toBe("recorded");
 });
 it("requires real audio PTS on both sides of observed folds",()=>{
  const fold={...base,mp4FoldProbes:2,mp4FoldMatched:2,mp4FoldPtsSpanChecks:2,
    mp4FoldAudioPtsSpanChecks:2,mp4FoldAudioPtsLargeGaps:0};
  expect(nativeRecordedModeEvidence(fold,12345)?.state).toBe("recorded");
  expect(nativeRecordedModeEvidence({...fold,mp4FoldAudioPtsSpanChecks:1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...fold,mp4FoldAudioPtsLargeGaps:1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...fold,audioRequested:false,mp4FoldAudioPtsSpanChecks:0},12345)?.state).toBe("recorded");
 });
 it("rejects impossible media timestamps and contradictory fold counts",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4VideoTimestampRollbacks:-1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4VideoTimestampDuplicates:0.5},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FoldProbes:1,mp4FoldMatched:1,
    mp4FoldPtsSpanChecks:2,mp4FoldAudioPtsSpanChecks:1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FoldProbes:1,mp4FoldMatched:1,
    mp4FoldPtsSpanChecks:1,mp4FoldAudioPtsSpanChecks:2},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FoldProbes:1,mp4FoldMatched:1,
    mp4FoldPtsSpanChecks:1,mp4FoldAudioPtsSpanChecks:1,
    mp4MaxFoldAudioPtsGapMs:-3},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4DurationMs:12000,
    mp4TailAudioSamples:2.5},12345)?.state).toBe("unknown");
 });
 it("refuses unfinalized recording and unknown dimensions",()=>{
  expect(nativeRecordedModeEvidence({...base,state:"recording"},12345)).toBeNull();
  expect(nativeRecordedModeEvidence({...base,cameraId:""},12345)).toBeNull();
  expect(nativeRecordedModeEvidence({...base,mp4VideoWidth:0},12345)?.state).toBe("unknown");
 });
 it("requires completed full-span timeline scans for newly audited Camera2 MP4",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4TimelineCompleted:true,
   mp4TimelineSamples:1800,mp4TimelineRollbacks:0,mp4TimelineDuplicates:0,
   mp4TimelineLargeGaps:0,mp4TimelineMaxGapMs:35},12345)?.state).toBe("recorded");
  expect(nativeRecordedModeEvidence({...base,mp4TimelineCompleted:false,
   mp4TimelineSamples:120000},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4TimelineCompleted:true,
   mp4TimelineSamples:400,mp4TimelineLargeGaps:3},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4TimelineCompleted:true,
   mp4TimelineSamples:400,mp4TimelineRollbacks:1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4TimelineCompleted:true,
   mp4TimelineSamples:-1},12345)?.state).toBe("unknown");
 });
 it("rejects incomplete real audio timeline while preserving deliberate silent recording",()=>{
  const incomplete={...base,mp4AudioTimelineCompleted:false,mp4AudioTimelineSamples:180000};
  expect(nativeRecordedModeEvidence(incomplete,12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...incomplete,audioRequested:false},12345)?.state).toBe("recorded");
  const good={...base,mp4AudioTimelineCompleted:true,mp4AudioTimelineTrackFound:true,
   mp4AudioTimelineSamples:8200,mp4AudioTimelineRollbacks:0,
   mp4AudioTimelineDuplicates:0,mp4AudioTimelineLargeGaps:0};
  expect(nativeRecordedModeEvidence(good,12345)?.state).toBe("recorded");
  expect(nativeRecordedModeEvidence({...good,mp4AudioTimelineLargeGaps:2},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...good,mp4AudioTimelineRollbacks:1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...good,mp4AudioTimelineSamples:NaN},12345)?.state).toBe("unknown");
 });
 it("rejects excessive measured audiovisual drift but keeps silent clips valid",()=>{
  const aligned={...base,mp4AvDriftMeasured:true,mp4AvDriftMs:80};
  expect(nativeRecordedModeEvidence(aligned,12345)?.state).toBe("recorded");
  expect(nativeRecordedModeEvidence({...aligned,mp4AvDriftMs:700},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...aligned,mp4AvDriftMeasured:false},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...aligned,mp4AvDriftMs:NaN},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...aligned,audioRequested:false,mp4AvDriftMs:700},12345)?.state).toBe("recorded");
 });
 it("rejects measured full-MP4 FPS mismatches while accepting valid timeline FPS",()=>{
  const verified={...base,mp4TimelineCompleted:true,mp4TimelineSamples:900,
   mp4TimelineRollbacks:0,mp4TimelineDuplicates:0,mp4TimelineLargeGaps:0,
   mp4TimelineSampledFps:29.97};
  expect(nativeRecordedModeEvidence(verified,12345)?.state).toBe("recorded");
  expect(nativeRecordedModeEvidence({...verified,mp4TimelineSampledFps:19.8},12345)?.state).toBe("unknown");
 });
 it("detects mid-file FPS collapses even if average full-file FPS is good",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4TimelineCompleted:true,
    mp4TimelineSampledFps:30,mp4TimelineSamples:3000,mp4LowFpsWindows:2},12345)?.state)
    .toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4TimelineCompleted:true,
    mp4TimelineSampledFps:30,mp4TimelineSamples:3000,mp4LowFpsWindows:0},12345)?.state)
    .toBe("recorded");
 });
 it("does not certify MP4 if live Camera2 callbacks stalled",()=>{
  expect(nativeRecordedModeEvidence({...base,cameraCallbackStallEpisodes:2},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,cameraCallbackStallEpisodes:0},12345)?.state).toBe("recorded");
 });
 it("never certifies an MP4 with reported Camera2 capture request failures",()=>{
  expect(nativeRecordedModeEvidence({...base,cameraCaptureFailureEvents:1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,cameraCaptureFailureEvents:0},12345)?.state).toBe("recorded");
 });
 it("marks reported Camera2 sensor timestamp discontinuity as unverified MP4",()=>{
  expect(nativeRecordedModeEvidence({...base,sensorTimestampDiscontinuities:1},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,sensorTimestampDiscontinuities:0},12345)?.state).toBe("recorded");
 });
 it("marks interrupted recording with truthful warning",()=>{
  const r=nativeRecordedModeEvidence({...base,state:"saved_interrupted"},12345);
  expect(r?.message).toContain("прерывание");
  expect(r?.state).toBe("unknown");
 });
});