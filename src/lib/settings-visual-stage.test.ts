import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleSettingsVisualStage } from "./settings-visual-stage";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("native Settings staged mounting without redundant GPU invalidations", () => {
  it("runs optional panels after four stable frames, not during the first Settings paint", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn); return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const mount = vi.fn();
    scheduleSettingsVisualStage(mount);
    for (let i = 0; i < 3; i++) {
      frames.shift()?.(16 * (i + 1));
      vi.advanceTimersByTime(0);
      expect(mount).not.toHaveBeenCalled();
    }
    frames.shift()?.(64);
    vi.advanceTimersByTime(0);
    expect(mount).toHaveBeenCalledOnce();
  });

  it("waits in real Android background and resumes Settings controls after visible frames", () => {
    vi.useFakeTimers();
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn); return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const mount = vi.fn();
    const cancel = scheduleSettingsVisualStage(mount, {
      stableFrames: 3, maxFrameGapMs: 350, backgroundFallbackMs: 35,
    });
    vi.advanceTimersByTime(300);
    expect(mount).not.toHaveBeenCalled();
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    frames.shift()?.(20);
    frames.shift()?.(40);
    frames.shift()?.(60);
    vi.advanceTimersByTime(0);
    expect(mount).toHaveBeenCalledOnce();
    cancel();
  });

  it("opens Settings on a responsive emulator even when visibility is incorrectly hidden", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn); return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const mount = vi.fn();
    const cancel = scheduleSettingsVisualStage(mount, {
      stableFrames: 3, maxFrameGapMs: 350, backgroundFallbackMs: 35,
    });
    frames.shift()?.(20);
    frames.shift()?.(40);
    frames.shift()?.(60);
    vi.advanceTimersByTime(0);
    expect(mount).toHaveBeenCalledOnce();
    cancel();
  });

  it("a screen exit cancels a deferred Settings group", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn); return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const mount = vi.fn();
    const cancel = scheduleSettingsVisualStage(mount);
    frames.shift()?.(16);
    cancel();
    for (const frame of frames) frame(32);
    vi.advanceTimersByTime(3000);
    expect(mount).not.toHaveBeenCalled();
  });
});
