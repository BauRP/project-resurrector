import {describe,expect,it} from "vitest";
import {nativeAnonymizedAuditReport} from "./native-audit-report";

describe("recovered native fold and camera report safety",()=>{
  it("rejects malformed history elements without exposing identifiers",()=>{
    const history={
      entries:[null,42,"corrupt",[],{state:"saved",cameraId:"SECRET-CAMERA",
        savedUri:"content://private/video",path:"/private/video.mp4",
        mp4CheckpointAuditCompleted:false,mp4FoldProbes:2,mp4FoldMatched:2,
        mp4FoldPtsSpanChecks:0}],
      omittedEarlier:0,maxEntries:24,
    };
    const report=nativeAnonymizedAuditReport(
      history as unknown as Parameters<typeof nativeAnonymizedAuditReport>[0]);
    const parsed=JSON.parse(report);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0].fold.checkpointAuditCompleted).toBe(false);
    expect(report).not.toContain("SECRET-CAMERA");
    expect(report).not.toContain("content://private");
    expect(report).not.toContain("/private/video.mp4");
  });
  it("reports uncheckable fold checkpoints without media paths",()=>{
    const parsed=JSON.parse(nativeAnonymizedAuditReport({
      entries:[{state:"saved_interrupted",mp4FoldPointsSkipped:2,
        mp4FoldProbes:0,mp4FoldPtsSpanChecks:0}],
      omittedEarlier:0,maxEntries:24,
    }));
    expect(parsed.entries[0].fold.skippedCheckpoints).toBe(2);
  });
  it("reports fold overflow and paused changes separately",()=>{
    const parsed=JSON.parse(nativeAnonymizedAuditReport({
      entries:[{state:"saved_interrupted",foldCheckpointsOmitted:2,
        foldChangesWhilePaused:4}],
      omittedEarlier:0,maxEntries:24,
    }));
    expect(parsed.entries[0].fold.checkpointLimitOmissions).toBe(2);
    expect(parsed.entries[0].fold.postureChangesWhilePaused).toBe(4);
  });
  it("preserves unknown observer continuity without leaking Android identifiers",()=>{
    const result=JSON.parse(nativeAnonymizedAuditReport({
      entries:[{state:"saved_interrupted",foldObserverGap:true}],
      omittedEarlier:0,maxEntries:24,
    }));
    expect(result.entries[0].fold.observerGap).toBe(true);
  });
  it("anonymously records bounded audio PTS anomalies",()=>{
    const parsed=JSON.parse(nativeAnonymizedAuditReport({
      entries:[{state:"saved_interrupted",mp4AudioPtsAnomalies:3}],
      omittedEarlier:0,maxEntries:24,
    }));
    expect(parsed.entries[0].media.audioPtsAnomalies).toBe(3);
  });
  it("includes bounded audio fold checks without raw media",()=>{
    const output=JSON.parse(nativeAnonymizedAuditReport({
      entries:[{state:"saved_interrupted",mp4FoldAudioPtsSpanChecks:2,
        mp4FoldAudioPtsLargeGaps:1,mp4MaxFoldAudioPtsGapMs:550}],
      omittedEarlier:0,maxEntries:24,
    }));
    expect(output.entries[0].fold.audioPtsChecks).toBe(2);
    expect(output.entries[0].fold.audioPtsLargeGaps).toBe(1);
  });
  it("separates real hinge posture from coordinate-only changes",()=>{
    const parsed=JSON.parse(nativeAnonymizedAuditReport({
      entries:[{state:"saved",foldPostureChanges:2,foldGeometryOnlyChanges:19}],
      omittedEarlier:0,maxEntries:24,
    }));
    expect(parsed.entries[0].fold.changes).toBe(2);
    expect(parsed.entries[0].fold.geometryOnlyChanges).toBe(19);
  });
  it("keeps missing checkpoint evidence unknown rather than fabricated success",()=>{
    const report=JSON.parse(nativeAnonymizedAuditReport({
      entries:[{state:"saved",mp4CheckpointAuditCompleted:false},
        {state:"saved",mp4CheckpointAuditCompleted:true},
        {state:"saved"}],
      omittedEarlier:0,maxEntries:24,
    }));
    expect(report.entries.map((x:{fold:{checkpointAuditCompleted:boolean|null}})=>
      x.fold.checkpointAuditCompleted)).toEqual([false,true,null]);
  });
 it("exports bounded timestamp audit without private camera identifiers",()=>{
  const report=nativeAnonymizedAuditReport({entries:[{
   cameraId:"PRIVATE_CAMERA",savedUri:"content://private/fold.mp4",
   mp4TimelineCompleted:false,mp4TimelineSamples:120000,
   mp4TimelineRollbacks:2,mp4TimelineDuplicates:1,
   mp4TimelineLargeGaps:5,mp4TimelineMaxGapMs:640
  }],maxEntries:24,omittedEarlier:0});
  const media=JSON.parse(report).entries[0].media;
  expect(media.timelineCompleted).toBe(false);
  expect(media.timelineSamples).toBe(120000);
  expect(media.timelineLargeGaps).toBe(5);
  expect(report).not.toContain("PRIVATE_CAMERA");
  expect(report).not.toContain("content://private");
 });

 it("retains bounded final capture AV drift and scan coverage without leaking private paths",()=>{
  const report=nativeAnonymizedAuditReport({entries:[{
    state:"saved_interrupted",cameraId:"SECRET_REAR",savedUri:"content://secret/record.mp4",
    mp4TimelineLimitReason:"time_limit",mp4AudioTimelineLimitReason:"sample_limit",
    mp4AvDriftMeasured:true,mp4AvDriftMs:650,
    mp4TimelineCompleted:false,mp4TimelineSamples:120000,
    mp4AudioTimelineCompleted:false,mp4AudioTimelineSamples:180000,
    foldGeometryOnlyChanges:5,foldObserverGap:true,
  }],maxEntries:24,omittedEarlier:0});
  const item=JSON.parse(report).entries[0];
  expect(item.media.timelineLimitReason).toBe("time_limit");
  expect(item.media.audioTimelineLimitReason).toBe("sample_limit");
  expect(item.media.avDriftMeasured).toBe(true);
  expect(item.media.avDriftMs).toBe(650);
  expect(item.fold.geometryOnlyChanges).toBe(5);
  expect(item.fold.observerGap).toBe(true);
  expect(report).not.toContain("SECRET_REAR");
  expect(report).not.toContain("content://secret");
 });

});
