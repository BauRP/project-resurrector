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
});
