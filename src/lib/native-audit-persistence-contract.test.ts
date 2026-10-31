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
 it("retains real MP4 track timeline and AV drift evidence after Activity recreation",()=>{
  for(const key of ["mp4TimelineLimitReason","mp4AudioTimelineLimitReason",
   "mp4TimelineCompleted","mp4AudioTimelineCompleted","mp4AudioTimelineTrackFound",
   "mp4TimelineSamples","mp4AudioTimelineSamples",
   "mp4TimelineRollbacks","mp4AudioTimelineRollbacks",
   "mp4TimelineDuplicates","mp4AudioTimelineDuplicates",
   "mp4TimelineLargeGaps","mp4AudioTimelineLargeGaps",
   "mp4TimelineMaxGapMs","mp4AudioTimelineMaxGapMs",
   "mp4AvDriftMeasured","mp4AvDriftMs"]){
    expect(store,"persistent capture history missing "+key).toContain('"'+key+'"');
    expect(service,"native service status missing "+key).toContain('"'+key+'"');
  }
  expect(store).toContain("p.edit().putString(ENTRIES,retained.toString())");
  expect(store).toContain(".commit();");
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
  const method=service.slice(service.indexOf("private static String publishVideo(Context context,File source,boolean requireAudio)"));
  expect(method).toContain("openOutputStream(dest)");
  expect(method).toContain("context.getContentResolver().openInputStream(dest)");
  expect(method.indexOf("openInputStream(dest)")).toBeGreaterThan(method.indexOf("MediaStore.Video.Media.IS_PENDING, 0"));
  expect(method).toContain("context.getContentResolver().delete(dest,null,null)");
 });
 it("verifies exact Gallery MP4 bytes with bounded streaming hash before reporting published",()=>{
  expect(service).toContain('MessageDigest.getInstance("SHA-256")');
  expect(service).toContain("originalHash.update(buf,0,size)");
  expect(service).toContain("publishedHash.update(verifyBuffer,0,verifyCount)");
  expect(service).toContain("MessageDigest.isEqual(originalHash.digest(),publishedHash.digest())");
  expect(service).toContain("if(verifiedBytes!=source.length()");
  expect(service).toContain("if (dest != null) try {context.getContentResolver().delete(dest,null,null);}");
 });
 it("notifies only actual TextureView owner on OS surface loss during a fold",()=>{
  expect(capturePlugin).toContain("onSurfaceTextureDestroyed(SurfaceTexture texture)");
  expect(capturePlugin).toContain('invalidatePreviewForLayout("surface_destroyed")');
  expect(capturePlugin).toContain("if(owner.equals(directOwner) && directView==lostView)");
  expect(capturePlugin).toContain("directView==lostView");
 });
 it("keeps the native fold TextureView off REC and idle controls",()=>{
   expect(capturePlugin).toContain('if(!"previewing".equals(captureState)){');
   expect(capturePlugin).toContain('ack.put("reason","camera_not_previewing")');
   expect(capturePlugin).toContain('if(owner.equals(directOwner))detachDirectView()');
 });
 it("finalizes each actual Camera2 MP4 at most once when UI, fold and service shutdown race",()=>{
  expect(service).toContain("finalizationStarted.compareAndSet(false,true)");
  expect(service).toContain("if(finalizationStarted.get())return START_NOT_STICKY;");
  expect(service).toContain("if(finalizationStarted.get()) return START_NOT_STICKY;");
  expect(service).toContain("private final AtomicBoolean finalizationStarted = new AtomicBoolean(false)");
 });
 it("routes detached TextureView destruction to UI looper and rejects stale surface callback",()=>{
   expect(capturePlugin).toContain('new Handler(Looper.getMainLooper()).post(()->{');
   expect(capturePlugin).toContain('directView==lostView');
   expect(capturePlugin).toContain('invalidatePreviewForLayout("surface_destroyed")');
   expect(capturePlugin).not.toContain('directView.post(()->{');
 });
 it("rejects a truncated MP4 against actual monotonic recorder duration after fold and pauses",()=>{
  expect(service).toContain("boolean durationMismatch=finishedDurationMs>2000L");
  expect(service).toContain("Math.abs(mp4DurationMs-finishedDurationMs)");
  expect(service).toContain("Math.max(1500L,finishedDurationMs/10L)");
  expect(service).toContain("boolean incomplete = sensorTimestampMissingEvents>0 ||");
  expect(service).toContain("durationMismatch || audioTimelineIssue");
 });
 it("ignores stale callbacks from replaced same-owner native TextureView",()=>{
  expect(capturePlugin).toContain("final TextureView createdView=directView");
  expect(capturePlugin).toContain("directView==createdView");
  expect(capturePlugin).toContain("final TextureView lostView=createdView");
 });
 it("validates real video and requested audio sample in the final published MediaStore item",()=>{
  expect(service).toContain("published.setDataSource(context,dest,null)");
  expect(service).toContain('if(!video || (requireAudio && !audio))');
  expect(service).toContain("publishVideo(this,media,wantAudio)");
  expect(service).toContain('publishVideo(context,source,prefs.getBoolean("recordAudio",false))');
 });
 it("keeps a readable MP4 marked interrupted after Camera2 failure",()=>{
  expect(service).toContain('final boolean captureFailed = "error".equals(state)');
  expect(service).toContain("boolean incomplete = sensorTimestampMissingEvents>0 ||");
  expect(service).toContain('String message = stopFailed');
  expect(service).toContain('NativeCaptureAuditStore.append(this,status(this))');
 });
 it("checks real geometry-only fold changes without inventing posture events",()=>{
   expect(service).toContain('}else if(!geometrySignature.equals(recordingLastFoldGeometrySignature)){');
   expect(service).toContain('recordingFoldGeometryOnlyChanges++');
   expect(service).toContain('String[] points=recordingFoldPointsMs.isEmpty()');
   expect(service).toContain('recordingFoldPointsMs+=');
   expect(service).toContain('recordingFoldCheckpointsOmitted++');
 });
 it("does not silently lose same-millisecond physical fold events in bounded MP4 audit",()=>{
  expect(service).toContain("if(activeMs>previousPoint && points.length<8)");
  expect(service).toContain("else if(activeMs==previousPoint &&");
  expect(service).toContain("recordingFoldCheckpointsOmitted++");
  expect(service).toContain("recordingPostureChanges++");
 });
 it("reports uncheckable same-millisecond hinge geometry events instead of silently dropping them",()=>{
  expect(service).toContain("else if(activeMs>=last && recordingFoldCheckpointsOmitted<Integer.MAX_VALUE)");
  expect(service).toContain("recordingFoldGeometryOnlyChanges++");
  expect(service).toContain("recordingFoldCheckpointsOmitted++");
 });
 it("flags paused geometry-only fold changes as uncheckable video evidence",()=>{
  expect(service).toContain('if("paused".equals(state)){');
  expect(service).toContain('recordingFoldGeometryOnlyChanges++');
  expect(service).toContain('recordingFoldCheckpointsOmitted++');
 });
 it("handles OEM MediaRecorder runtime and recording-limit callbacks without losing failure evidence",()=>{
  expect(service).toContain("encoder.setOnErrorListener((recorder,what,extra)->{");
  expect(service).toContain("encoder.setOnInfoListener((recorder,what,extra)->{");
  expect(service).toContain("if(session!=generation || encoder!=configuredRecorder ||");
  expect(service).toContain('fail(new IllegalStateException(');
 });
 it("retains camera sensor callback stalls for fold diagnostics",()=>{
  expect(service).toContain("cameraCallbackStallEpisodes++");
  expect(service).toContain("maxCameraCallbackSilenceMs=Math.max(");
  expect(store).toContain('"cameraCallbackStallEpisodes"');
 });
 it("tracks actual native Camera2 request failure evidence independently of fold geometry",()=>{
  expect(service).toContain("onCaptureFailed(CameraCaptureSession session,");
  expect(service).toContain("cameraCaptureFailureEvents++");
  expect(service).toContain("foldNearbyCaptureFailureEvents++");
  expect(store).toContain('"cameraCaptureFailureEvents"');
 });
 it("keeps the fold safety gate unknown across WindowManager Activity teardown",()=>{
  expect(foldObserver).toContain("surfaceObservationRequired&&!surfaceTopologyObserved");
  expect(foldObserver).toContain("if(disarmSurfaceLease(observerLease))");
  expect(foldObserver).toContain("NativeCapturePlugin.onFoldGeometryChanged()");
  expect(service).toContain("sensorTimestampDiscontinuities++");
  expect(store).toContain('"sensorTimestampDiscontinuities"');
 });
 it("does not miscount intentional MediaRecorder pause as a sensor clock failure",()=>{
  expect(service).toContain("lastSensorNs=0L;");
  expect(service).toContain("sensorWindowFirstNs=0L;");
  expect(service).toContain("encoder.resume();");
  const resume=service.slice(service.indexOf("private void resumeRecording()"),service.indexOf("@Override public int onStartCommand"));
  expect(resume).toContain("lastSensorNs=0L;");
 });
 it("hides stale TextureView immediately when a new fold observer has unknown topology",()=>{
  const start=foldObserver.slice(foldObserver.indexOf("armSurfaceLease(lease);"),foldObserver.indexOf("adapter.addWindowLayoutInfoListener"));
  expect(start).toContain("NativeCapturePlugin.onFoldGeometryChanged()");
 });
 it("ignores stale Camera2 callbacks from previous sessions after fold surface rebind",()=>{
  expect(service).toContain("session!=capture)return;");
  expect(service).toContain('session!=capture || !"recording".equals(state))return;');
  expect(service).toContain("callbackGeneration!=generation");
 });
 it("does not certify missing Camera2 sensor timestamps around a physical fold",()=>{
  expect(service).toContain("sensorTimestampMissingEvents++");
  expect(service).toContain("foldNearbyMissingSensorTimestamps++");
  expect(service).toContain("boolean incomplete = sensorTimestampMissingEvents>0 ||");
  expect(store).toContain('"sensorTimestampMissingEvents"');
 });
 it("rebinds only active preview on native TextureView resize and never the MediaRecorder session",()=>{
  expect(capturePlugin).toContain("onSurfaceTextureSizeChanged(SurfaceTexture texture,int width,int height)");
  expect(capturePlugin).toContain("NativeCaptureService.onDirectPreviewTextureResized(owner,texture)");
  expect(service).toContain("texture!=directPreviewTexture");
  expect(service).toContain("runningInstance.encoder!=null");
  expect(service).toContain("active.worker.postDelayed(active.previewRebindTask,120L)");
 });
 it("treats invalid separating hinge geometry as unsafe native preview",()=>{
  expect(foldObserver).toContain("hinge.width()<0||hinge.height()<0");
  expect(foldObserver).toContain("nextHinges.add(new Rect(Integer.MIN_VALUE/4");
 });
 it("uses both CSS axes when placing native TextureView in a foldable",()=>{
  expect(capturePlugin).toContain('call.getDouble("viewportHeight")');
  expect(capturePlugin).toContain("cssScaleX=web.getWidth()");
  expect(capturePlugin).toContain("cssScaleY=web.getHeight()");
  expect(capturePlugin).toContain("y.floatValue()*cssScaleY");
  expect(capturePlugin).toContain("h.floatValue()*cssScaleY");
 });
 it("hides Camera2 native overlay when Activity or WebView actually resizes",()=>{
   expect(capturePlugin).toContain("web.addOnLayoutChangeListener(directBoundsListener)");
   expect(capturePlugin).toContain("root.addOnLayoutChangeListener(directBoundsListener)");
   expect(capturePlugin).toContain("webWindow.contains(viewWindow)&&rootWindow.contains(viewWindow)");
   expect(capturePlugin).toContain("clearPreviewBoundsWatch()");
   expect(capturePlugin).toContain('ack.put("visible",owner.equals(directOwner)&&directView!=null&&');
   expect(capturePlugin).not.toContain('call.resolve();\n   });\n }\n @Override protected void handleOnDestroy()');
 });
 it("rejects a direct camera surface crossing a real WindowManager hinge",()=>{
  expect(foldObserver).toContain("surfaceTopologyObserved=false");
  expect(foldObserver).toContain("if(!fold.isSeparating())continue;");
  expect(foldObserver).toContain("nextHinges.add(hinge)");
  expect(foldObserver).toContain("surfaceHinges.addAll(nextHinges)");
  expect(foldObserver).toContain("if(Rect.intersects(rect,hinge))return true;");
  expect(capturePlugin).toContain("DisplayTopologyPlugin.isUnsafeDirectPreviewWindowRect");
  expect(capturePlugin).toContain("if(owner.equals(directOwner))detachDirectView()");
 });
 it("coalesces duplicate WindowManager callbacks but checks first actual topology",()=>{
   expect(foldObserver).toContain("changed=!surfaceTopologyObserved || !surfaceHinges.equals(nextHinges)");
   expect(foldObserver).toContain("Collections.sort(nextHinges");
   expect(foldObserver).toContain("if(changed)NativeCapturePlugin.onFoldGeometryChanged()");
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
   expect(service).toContain('boolean incomplete = sensorTimestampMissingEvents>0 ||');
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
 it("preflights the device AVC encoder and applies its declared bitrate",()=>{
   expect(service).toContain("private int advertisedH264Bitrate(int width,int height,int fps)");
   expect(service).toContain('video.areSizeAndRateSupported(width,height,fps)');
   expect(service).toContain('int selectedVideoBitrate=advertisedH264Bitrate(width,height,fps)');
   expect(service).toContain('encoder.setVideoEncodingBitRate(selectedVideoBitrate)');
   expect(service).toContain("H.264-кодировщики устройства не объявляют поддержку");
 });
 it("checks H264 encoder support before opening recorder",()=>{
   expect(service).toContain("private int advertisedH264Bitrate(int width,int height,int fps)");
   expect(service).toContain("video.areSizeAndRateSupported(width,height,fps)");
   expect(service).toContain("encoder.setVideoEncodingBitRate(selectedVideoBitrate)");
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
