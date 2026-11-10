import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("independent WebView diagnostic keeps camera and Settings unchanged",()=>{
  it("checks the actual renderer independently of the Capacitor plugin executor",()=>{
    const java=readFileSync("android/app/src/main/java/app/lovable/multicampov/UiFreezeMonitor.java","utf8");
    const main=readFileSync("android/app/src/main/java/app/lovable/multicampov/MainActivity.java","utf8");
    expect(java).toContain("webView.evaluateJavascript(");
    expect(java).toContain("document.documentElement.dataset.activeMulticamTab");
    expect(java).toContain("Independent WebView JavaScript evaluation responded recently");
    expect(java).toContain("Independent WebView JavaScript probe did not respond recently");
    expect(java).toContain("rendererProbePending.compareAndSet(false, true)");
    expect(java).toContain("monitorEpoch.incrementAndGet()");
    expect(main).toContain("bridge != null ? bridge.getWebView() : null");
  });

  it("retries renderer checks after a stuck callback without accepting a stale reply",()=>{
    const java=readFileSync("android/app/src/main/java/app/lovable/multicampov/UiFreezeMonitor.java","utf8");
    expect(java).toContain("RENDERER_PROBE_TIMEOUT_MS = 6000L");
    expect(java).toContain("RENDERER_PROBE_RETRY_MS = 9000L");
    expect(java).toContain("rendererProbePending.compareAndSet(true, false)");
    expect(java).toContain("rendererProbeGeneration.incrementAndGet()");
    expect(java).toContain("generation == rendererProbeGeneration.get()");
    expect(java).toContain("Independent WebView JavaScript probe timed out after ");
    expect(java).toContain("rendererProbeSentAt.set(now); // back off: never flood UI thread");
  });
});
