import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

// A source-level regression guard: these diagnostic fields must survive
// Android process death and be visible in the anonymized report. This is
// NOT a substitute for Android instrumentation or hardware testing.
const nativeDir="android/app/src/main/java/app/lovable/multicampov/";
const store=readFileSync(nativeDir+"NativeCaptureAuditStore.java","utf8");
const service=readFileSync(nativeDir+"NativeCaptureService.java","utf8");
const report=readFileSync("src/lib/native-audit-report.ts","utf8");
describe("native Camera2 and fold audit persistence contract",()=>{
 it("persists all essential late-stage fold and MP4 audit fields",()=>{
  for(const key of ["mp4CheckpointAuditCompleted","mp4FoldPointsSkipped",
    "mp4FoldPtsSpanChecks","mp4FoldPtsLargeGaps",
    "foldPostureChanges","foldGeometryOnlyChanges",
    "foldCheckpointsOmitted","foldChangesWhilePaused","foldObserverGap"]){
   expect(store, "native history omitted "+key).toContain('"'+key+'"');
   expect(service, "service missing "+key).toContain('"'+key+'"');
  }
 });
 it("does not revive abandoned recording as an MP4 success",()=>{
  expect(service).toContain('recovered.put("mp4CheckpointAuditCompleted",false)');
  expect(service).toContain('recovered.put("savedBytes",0L)');
  expect(service).toContain('recovered.put("state","interrupted")');
 });
 it("clears stale MP4 claims after recovery of an abandoned recorder",()=>{
  for(const token of [
    '.putString("path","")','.putString("uri","")',
    '.putBoolean("mp4TracksInspected",false)',
    '.putBoolean("mp4HasVideoTrack",false)',
    '.putBoolean("mp4CheckpointAuditCompleted",false)',
    '.putInt("mp4VideoSamples",0)',
    '.putLong("mp4DurationMs",-1L)']){
    expect(service).toContain(token);
  }
 });
 it("exports only explicit bounded counters without raw media identifiers",()=>{
  expect(report).toContain('item["foldGeometryOnlyChanges"]');
  expect(report).toContain('item["mp4FoldPointsSkipped"]');
  expect(report).toContain('item["mp4CheckpointAuditCompleted"]');
  expect(report).not.toContain('item["savedUri"]');
  expect(report).not.toContain('item["cameraId"]');
 });
});
