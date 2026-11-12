import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra Android 15 freeze smoke must distinguish renderer stalls from test overhead", () => {
  const test = readFileSync("android/app/src/androidTest/java/app/lovable/multicampov/MulticamFreezeNavigationInstrumentedTest.java", "utf8");
  const baseline = readFileSync("android/app/src/debug/java/app/lovable/multicampov/MinimalWebViewActivity.java", "utf8");
  const workflow = readFileSync(".github/workflows/android_emulator_freeze_smoke.yml", "utf8");
  it("requires real 30-second idle time, repeated DOM and JS replies, and callback deadlines", () => {
    const code = test.slice(test.indexOf("public void a00ColdStartIdleThirtySecondsWithoutTouches()"),
      test.indexOf("public void a0IdleLaunchRendererRespondsWithoutUserMedia()"));
    expect(code).toContain("start < 30000L");
    expect(code).toContain("elapsed >= 30000L");
    expect(code).toContain("checks >= 3");
    expect(code).not.toContain("checks >= 15");
    expect(code).toContain('eval(running, view, "1+1===2")');
    expect(code).toContain("!!document.querySelector('.bottom-nav button:nth-child(3)')");
    expect(test).toContain("reply.await(12, TimeUnit.SECONDS)");
  });
  it("releases debug-only WebView GPU surface before the full app starts", () => {
    expect(baseline).toContain("retiring.stopLoading()");
    expect(baseline).toContain("((ViewGroup) parent).removeView(retiring)");
    expect(baseline).toContain("retiring.destroy()");
    expect(baseline.indexOf("removeView(retiring)")).toBeLessThan(baseline.indexOf("retiring.destroy()"));
    expect(test).toContain("activity instanceof MinimalWebViewActivity ? 1500 : 300");
  });
  it("checks a smaller SwiftShader surface in addition to the original full Android 15 test", () => {
    expect(workflow).toContain("gpu: swiftshader\n            resolution: full");
    expect(workflow).toContain("gpu: swiftshader\n            resolution: compact");
    expect(workflow).toContain("gpu: swangle\n            resolution: full");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("Retry infrastructure-disconnected emulator once");
    expect(workflow).toContain("mode: isolated");
    expect(workflow).toContain("mode: full");
    expect(workflow).toContain("MULTICAM_SMOKE_MODE: ${{ matrix.mode }}");
    const runner = readFileSync("scripts/run-android-freeze-test.sh", "utf8");
    expect(runner).toContain("#a00ColdStartIdleThirtySecondsWithoutTouches");
    expect(runner).toContain('TEST_TARGET="$TEST_TARGET#a00ColdStartIdleThirtySecondsWithoutTouches"');
    expect(runner).toContain('case "$SMOKE_MODE" in');
    expect(runner).toContain('QEMU_HEALTH_FILE=');
    expect(runner).toContain('"$QEMU_WATCHER_PID"');
  });
});
