import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra camera destroy and WebView native recovery", () => {
 const camera=readFileSync("android/app/src/main/java/app/lovable/multicampov/MultiCamNativePlugin.java","utf8");
 const monitor=readFileSync("android/app/src/main/java/app/lovable/multicampov/UiFreezeMonitor.java","utf8");
 const activity=readFileSync("android/app/src/main/java/app/lovable/multicampov/MainActivity.java","utf8");
 it("never closes high-speed MediaRecorder on MAIN during Activity teardown",()=>{
   const destroy=camera.slice(camera.indexOf("protected void handleOnDestroy()"),
     camera.indexOf("/** Encoder declarations"));
   expect(destroy).toContain("cameraOperationWorker.execute(this::cleanup)");
   expect(destroy).toContain("cameraOperationWorker.shutdown()");
   expect(destroy).not.toContain("cameraOperationWorker.shutdownNow()");
   expect(destroy).not.toMatch(/^\s*cleanup\(\);/m);
   expect(camera).toContain("cleanupInProgress.compareAndSet(false, true)");
   expect(camera).toContain("closingSession.close()");
   expect(camera).toContain("closingRecorder.release()");
 });
 it("closes a stale native recovery dialog only after genuine JS heartbeat returns",()=>{
   expect(monitor).toContain("webViewCaptured.getAndSet(false)");
   expect(monitor).toContain("setWebViewResponsiveListener(Runnable listener)");
   expect(monitor).toContain("rendererUnresponsiveRecorded.getAndSet(false)");
   expect(activity).toContain("setWebViewResponsiveListener(webViewResponsive)");
   expect(activity).toContain("setWebViewResponsiveListener(null)");
   expect(activity).toContain("dismissRecoveryDialog()");
   expect(monitor).toContain("!independentRendererResponsive || rendererUnresponsiveRecorded.get()");
 });
});
