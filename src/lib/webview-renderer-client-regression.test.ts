import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("Android WebView renderer freeze callback",()=>{
 it("logs actual renderer freezes without killing or restarting camera",()=>{
   const main=readFileSync("android/app/src/main/java/app/lovable/multicampov/MainActivity.java","utf8");
   const monitor=readFileSync("android/app/src/main/java/app/lovable/multicampov/UiFreezeMonitor.java","utf8");
   expect(main).toContain("Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q");
   expect(main).toContain("webView.setWebViewRenderProcessClient");
   expect(main).toContain("UiFreezeMonitor.recordRendererUnresponsive()");
   expect(main).toContain("UiFreezeMonitor.recordRendererResponsive()");
   expect(monitor).toContain("Android WebView renderer reported UNRESPONSIVE");
   expect(monitor).toContain("rendererUnresponsiveRecorded.compareAndSet(false, true)");
   expect(monitor).toContain("executor.execute(() => persistReport(");
   expect(main).not.toContain("renderer.terminate()");
 });
});
