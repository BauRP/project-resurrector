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
