import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

// A source-level regression guard: these diagnostic fields must survive
// Android process death and be visible in the anonymized report. This is
// NOT a substitute for Android instrumentation or hardware testing.
const nativeDir="android/app/src/main/java/app/lovable/multicampov/";
const store=readFileSync(nativeDir+"NativeCaptureAuditStore.java","utf8");
const service=readFileSync(nativeDir+"NativeCaptureService.java","utf8");
const foldObserver=readFileSync(nativeDir+"DisplayTopologyPlugin.java","utf8");
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
 it("activates the fold observer lease before registering its first callback",()=>{
  const before=foldObserver.indexOf("NativeCaptureService.observeFoldObserverActive(lease);");
  const subscribe=foldObserver.indexOf("adapter.addWindowLayoutInfoListener(getActivity(), main, listener);");
  expect(before).toBeGreaterThan(0);
  expect(subscribe).toBeGreaterThan(before);
 });
 it("arms real pre-capture fold baseline in both recorder session paths",()=>{
  expect(service).toContain("latestObservedFoldPosture=postureSignature;");
  expect(service).toContain("recordingFoldObserverLease.equals(latestObservedFoldLease)");
  const startCalls=service.match(/armRecordingFoldBaseline\(\);/g)??[];
  expect(startCalls).toHaveLength(2);
  expect(service).toContain("recordingFoldObserverGap=true;");
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
