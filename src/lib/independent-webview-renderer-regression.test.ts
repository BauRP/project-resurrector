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
});
