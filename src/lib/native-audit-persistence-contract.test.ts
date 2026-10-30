import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

// A source-level regression guard: these diagnostic fields must survive
// Android process death and be visible in the anonymized report. This is
// NOT a substitute for Android instrumentation or hardware testing.
const nativeDir="android/app/src/main/java/app/lovable/multicampov/";
const store=readFileSync(nativeDir+"NativeCaptureAuditStore.java","utf8");
const service=readFileSync(nativeDir+"NativeCaptureService.java","utf8");
const foldObserver=readFileSync(nativeDir+"DisplayTopologyPlugin.java","utf8");
const capturePlugin=readFileSync(nativeDir+"NativeCapturePlugin.java","utf8");
const report=readFileSync("src/lib/native-audit-report.ts","utf8");
describe("native Camera2 and fold audit persistence contract",()=>{
 it("persists all essential late-stage fold and MP4 audit fields",()=>{
  for(const key of ["mp4CheckpointAuditCompleted","mp4FoldPointsSkipped",
    "mp4FoldPtsSpanChecks","mp4FoldPtsLargeGaps",
    "foldPostureChanges","foldGeometryOnlyChanges",
    "foldCheckpointsOmitted","foldChangesWhilePaused","foldObserverGap",
    "mp4FoldAudioPtsSpanChecks","mp4FoldAudioPtsLargeGaps","mp4MaxFoldAudioPtsGapMs",
    "mp4AudioPtsAnomalies","mp4TailAudioSamples","mp4TailAudioNearEnd","mp4AvTailOffsetMeasured","mp4AvTailOffsetMs"]){
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
 it("resets MediaExtractor before scanning each track and binds size to sampled track",()=>{
  const start=service.indexOf("private void scanMp4Track(");
  const end=service.indexOf("private void scanMp4Tail(",start);
  const block=service.slice(start,end);
  expect(block).toContain("extractor.seekTo(0L,MediaExtractor.SEEK_TO_PREVIOUS_SYNC)");
  expect(service).toContain("if(videoTrack < 0){");
  expect(service).toContain("audit.audioPtsAnomalies += rollbacks + duplicates;");
 });
 it("reopens the published MediaStore item instead of trusting only copied bytes",()=>{
  const method=service.slice(service.indexOf("private static String publishVideo(Context context,File source)"));
  expect(method).toContain("openOutputStream(dest)");
  expect(method).toContain("context.getContentResolver().openInputStream(dest)");
  expect(method.indexOf("openInputStream(dest)")).toBeGreaterThan(method.indexOf("MediaStore.Video.Media.IS_PENDING, 0"));
  expect(method).toContain("context.getContentResolver().delete(dest,null,null)");
 });
 it("keeps a readable MP4 marked interrupted after Camera2 failure",()=>{
  expect(service).toContain('final boolean captureFailed = "error".equals(state)');
  expect(service).toContain("boolean incomplete = captureFailed || stopFailed || checkpointIssue");
  expect(service).toContain('String message = stopFailed');
  expect(service).toContain('NativeCaptureAuditStore.append(this,status(this))');
 });
 it("uses both CSS axes when placing native TextureView in a foldable",()=>{
  expect(capturePlugin).toContain('call.getDouble("viewportHeight")');
  expect(capturePlugin).toContain("cssScaleX=web.getWidth()");
  expect(capturePlugin).toContain("cssScaleY=web.getHeight()");
  expect(capturePlugin).toContain("y.floatValue()*cssScaleY");
  expect(capturePlugin).toContain("h.floatValue()*cssScaleY");
 });
 it("rejects a direct camera surface crossing a real WindowManager hinge",()=>{
  expect(foldObserver).toContain("surfaceTopologyObserved=false");
  expect(foldObserver).toContain("if(!fold.isSeparating())continue;");
  expect(foldObserver).toContain("surfaceHinges.add(hinge)");
  expect(foldObserver).toContain("if(Rect.intersects(rect,hinge))return true;");
  expect(capturePlugin).toContain("DisplayTopologyPlugin.isUnsafeDirectPreviewWindowRect");
  expect(capturePlugin).toContain("if(owner.equals(directOwner))detachDirectView()");
 });
 it("checks an already visible native overlay after a real hinge moves",()=>{
   expect(foldObserver).toContain("NativeCapturePlugin.onFoldGeometryChanged()");
   expect(capturePlugin).toContain("hidePreviewCrossingCurrentFold()");
   expect(capturePlugin).toContain("DisplayTopologyPlugin.isUnsafeDirectPreviewWindowRect(");
   expect(capturePlugin).toContain("if(visiblePreview.get()==this)visiblePreview.clear()");
 });
 it("restricts Gallery retry to a verified last app-owned clip",()=>{
   expect(service).toContain('public static boolean retryGalleryPublication(Context context)');
   expect(service).toContain('new File(context.getFilesDir(),"native-video").getCanonicalFile()');
   expect(service).toContain('expectedDir.equals(source.getParentFile())');
   expect(service).toContain('prefs.getLong("captureId",0L)!=captureId');
   expect(capturePlugin).toContain('new Thread(()->');
 });
 it("salvages readable MP4 after MediaRecorder.stop throws without certifying success",()=>{
   expect(service).toContain('boolean stopFailed = false');
   expect(service).toContain('boolean valid = previouslyRecording && savedMp4HasVideo(media)');
   expect(service).toContain('boolean incomplete = captureFailed || stopFailed || checkpointIssue');
   expect(service).toContain('String message = stopFailed');
   expect(service).toContain('saved_interrupted');
 });
 it("protects native Camera2 long capture from full storage",()=>{
   expect(service).toContain("MIN_CAPTURE_START_BYTES = 96L*1024L*1024L");
   expect(service).toContain("MIN_CAPTURE_CONTINUE_BYTES = 32L*1024L*1024L");
   expect(service).toContain("directory.getUsableSpace()<MIN_CAPTURE_START_BYTES");
   expect(service).toContain("dir.getUsableSpace()<MIN_CAPTURE_CONTINUE_BYTES");
   expect(service.match(/armStorageMonitor\(session\);/g)).toHaveLength(2);
   expect(service).toContain("worker.removeCallbacks(storageMonitor)");
   expect(service).toContain("Недостаточно свободной памяти для безопасного завершения MP4");
 });
 it("fails gracefully on real Android emergency thermal status",()=>{
   expect(service).toContain("power.getCurrentThermalStatus()");
   expect(service).toContain("PowerManager.THERMAL_STATUS_EMERGENCY");
   expect(service).toContain("String thermalFailure=criticalThermalFailure()");
   expect(service).toContain("if(thermalFailure!=null)");
 });
 it("reserves unique MP4 paths instead of timestamp reuse",()=>{
   expect(service).toContain('File.createTempFile("native-" + currentCaptureId + "-", ".mp4", directory)');
   expect(service).not.toContain('media = new File(directory, "native-" + System.currentTimeMillis()');
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
