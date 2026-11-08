import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Android WebView real frame-commit barrier", () => {
  it("never calls DOM-ready a completed GPU frame on Android 10+", () => {
    const native = readFileSync(
      "android/app/src/main/java/app/lovable/multicampov/UiFreezePlugin.java", "utf8");
    expect(native).toContain("webView.postVisualStateCallback(started,");
    expect(native).toContain("observer.registerFrameCommitCallback(");
    expect(native).toContain('finish.accept("frame_committed")');
    expect(native).toContain("webView.postInvalidateOnAnimation()");
    expect(native).toContain('finish.accept("visual_state_only")');
    expect(native).toContain('finish.accept("timeout")');
    expect(native.indexOf("registerFrameCommitCallback")).toBeGreaterThan(
      native.indexOf("postVisualStateCallback"));
  });
  it("keeps frame deadlines and independently captures hangs before test teardown", () => {
    const shell = readFileSync("scripts/run-android-freeze-test.sh", "utf8");
    const native = readFileSync(
      "android/app/src/main/java/app/lovable/multicampov/UiFreezePlugin.java", "utf8");
    expect(shell).toContain("android-freeze-renderer-stacks-");
    expect(shell).toContain('MultiCamFreezeTest: WebView did not reply');
    expect(native).toContain("4500L");
    expect(native).toContain("completed.compareAndSet(false, true)");
  });
});