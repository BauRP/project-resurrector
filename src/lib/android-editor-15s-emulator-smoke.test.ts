import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("real 15-second Android WebView Editor freeze reproduction", () => {
  const java = readFileSync(
    "android/app/src/androidTest/java/app/lovable/multicampov/MulticamFreezeNavigationInstrumentedTest.java", "utf8");
  const fixture = readFileSync("android/app/src/androidTest/assets/editor-15s-smoke.js", "utf8");
  it("generates and saves real encoded media only in the instrumentation APK", () => {
    expect(fixture).toContain("canvas.captureStream(15)");
    expect(fixture).toContain("new MediaRecorder(");
    expect(fixture).toContain("15000");
    expect(fixture).toContain('indexedDB.open("multicam-pov-media", 1)');
    expect(fixture).toContain('localStorage.setItem("multicam-editor-project-v1"');
    expect(fixture).toContain('localStorage.setItem("multicam-view-state-v1"');
    expect(fixture).toContain("playhead: 0");
    expect(fixture).toContain("duration: 15, blob: blob");
  });
  it("checks renderer responses, playback controls and navigation with the actual video decoder", () => {
    expect(java).toContain("zRealFifteenSecondEditorVideoDoesNotFreezeWebView");
    expect(java).toContain("15-second encoded clip fixture status:");
    expect(java).toContain('click(running, view, "button[aria-label=\'Играть\']")');
    expect(java).toContain("Editor JS event loop stalled while playing 15-second video");
    expect(java).toContain("Editor disappeared during or after video playback");
    expect(java).not.toContain("Video layer disappeared during editor playback");
    expect(java).toContain("WebView cannot create a 15-second fixture");
    expect(java).toContain("settings-fold-workspace");
  });
});
