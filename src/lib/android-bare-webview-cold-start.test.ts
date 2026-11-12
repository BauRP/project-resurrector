import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Clean-install navigation and standalone WebView on Android", () => {
  const app = readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
  const test = readFileSync("android/app/src/androidTest/java/app/lovable/multicampov/MulticamFreezeNavigationInstrumentedTest.java","utf8");
  it("keeps camera features fully available without evaluating its bundle before its entry gate", () => {
    expect(app).not.toContain('import { CameraWorkspace } from "./CameraWorkspace";');
    expect(app).toContain('const CameraWorkspace = lazy(() => import("./CameraWorkspace")');
    expect(app).toContain('<CameraEntryGate><CameraWorkspace /></CameraEntryGate>');
    expect(app).toContain('<EditorEntryGate><EditorTab /></EditorEntryGate>');
  });
  it("tests a real empty WebView without first running the app and NEVER ships this Activity in release", () => {
    const first = test.slice(test.indexOf("public void a000BaselineChromiumWithoutReactStillExecutesJavascript()"),
      test.indexOf("private static void isolateThenNavigate"));
    expect(first).toContain("MinimalWebViewActivity.class");
    expect(first).not.toContain("MainActivity.class");
    expect(first).not.toContain("loadDataWithBaseURL(");
    expect(readFileSync("android/app/src/debug/AndroidManifest.xml","utf8"))
      .toContain('android:name=".MinimalWebViewActivity"');
    expect(readFileSync("android/app/src/debug/java/app/lovable/multicampov/MinimalWebViewActivity.java","utf8"))
      .not.toContain("BridgeActivity");
    expect(readFileSync("android/app/src/main/AndroidManifest.xml","utf8")).not.toContain("MinimalWebViewActivity");
  });
  it("checks at least thirty taps on Settings and Camera without recording", () => {
    expect(test).toContain("for (int i=0; i<15; i++)");
    // A previous accidental literal backslash+n after a // comment
    // commented out the loop and broke all four Android builds.
    expect(test).not.toMatch(/\/\/[^\r\n]*\\n\s+for\s*\(/);
    expect(test).toContain('click(running, view, ".bottom-nav button:nth-child(3)")');
    expect(test).toContain('click(running, view, ".bottom-nav button:nth-child(1)")');
  });

  it("separates a hidden emulator window from real idle Camera failures", () => {
    const test = readFileSync("android/app/src/androidTest/java/app/lovable/multicampov/MulticamFreezeNavigationInstrumentedTest.java","utf8");
    expect(test).not.toContain("document.visibilityState==='visible'&&");
    expect(test).toContain("eventually(running, web.get(), \"!!document.querySelector('.camera-screen')\")");
    expect(test).toContain('assertEquals("Idle Camera disappeared; diagnostic=" + evidence');
    expect(test).toContain('eval(running, web.get(), "1+1===2")');
  });
  it("does not make Settings loading depend on a 60fps WebView renderer", () => {
    const settings = readFileSync("src/components/multicam/SettingsTab.tsx","utf8");
    const app = readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
    expect(settings).not.toContain("maxFrameGapMs: 125");
    expect(settings).toContain("maxFrameGapMs: 350");
    expect(app).toContain("{ stableFrames: 5, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true }");
  });
});
