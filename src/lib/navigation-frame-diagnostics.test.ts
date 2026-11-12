import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { monitorNavigationFrame } from "./navigation-frame-diagnostics";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Android button-only navigation responsiveness without GPU transforms", () => {
  it("does not diagnose healthy renderer frames", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { frames.push(fn); return 1; });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const report = vi.fn();
    monitorNavigationFrame("settings", report);
    frames[0]?.(16);
    vi.runAllTimers();
    expect(report).not.toHaveBeenCalled();
  });
  it("reports a missing frame only when JS timers still respond", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 19));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const report = vi.fn();
    monitorNavigationFrame("settings", report, { deadlineMs: 2000 });
    vi.advanceTimersByTime(2000);
    expect(report).toHaveBeenCalledOnce();
    expect(report.mock.calls[0]![0]).toContain("rAF absent");
    expect(report.mock.calls[0]![0]).toContain("JS timer alive");
  });
  it("cancels a stale probe after leaving a tab", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 17));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const report = vi.fn();
    const cancel = monitorNavigationFrame("camera", report);
    cancel();
    vi.runAllTimers();
    expect(report).not.toHaveBeenCalled();
  });
  it("does not mistake a backgrounded WebView for a freeze", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 17));
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const report = vi.fn();
    monitorNavigationFrame("editor", report);
    vi.runAllTimers();
    expect(report).not.toHaveBeenCalled();
  });
  it("retains the original appearance and active controls without native press layers", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const app = readFileSync("src/components/multicam/MulticamApp.tsx", "utf8");
    const nativeRule = css.slice(css.indexOf("/* Native touch navigation:"));
    expect(nativeRule).toContain(':root[data-multicam-native-webview="true"]');
    expect(nativeRule).toContain(".bottom-nav button");
    expect(nativeRule).toContain(".settings-fold-workspace button");
    expect(nativeRule).toContain(".app-header button");
    expect(nativeRule).toContain("transform: none !important");
    expect(nativeRule).toContain("opacity: .90");
    expect(app).toContain("monitorNavigationFrame(tab");
    expect(css).toContain("var(--reference-backdrop)");
  });
  it("checks cold native Camera launch before other WebView diagnostic Activities", () => {
    const nativeTest = readFileSync("android/app/src/androidTest/java/app/lovable/multicampov/MulticamFreezeNavigationInstrumentedTest.java","utf8");
    expect(nativeTest).toContain("a0IdleLaunchRendererRespondsWithoutUserMedia");
    expect(nativeTest).toContain("a000BaselineChromiumWithoutReactStillExecutesJavascript");
    expect(nativeTest).toContain("MethodSorters.NAME_ASCENDING");
  });
});
