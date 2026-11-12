import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleAfterPaintTask, scheduleAfterResponsivePaint } from "./after-paint-task";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Android WebView non-blocking deferred persistence", () => {
  it("does not do synchronous storage work in the navigation task or first frame", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const task = vi.fn();
    scheduleAfterPaintTask(task);
    expect(task).not.toHaveBeenCalled();
    frames.shift()?.(16);
    expect(task).not.toHaveBeenCalled();
    frames.shift()?.(32);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(0);
    expect(task).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledOnce();
  });

  it("persists once when Android WebView suppresses all animation frames", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 99));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const task = vi.fn();
    scheduleAfterPaintTask(task, 90);
    vi.advanceTimersByTime(89);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledOnce();
  });

  it("cancels a stale editor snapshot without touching storage", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 22));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const task = vi.fn();
    const cancel = scheduleAfterPaintTask(task);
    cancel();
    vi.runAllTimers();
    expect(task).not.toHaveBeenCalled();
  });
});

describe("Astra hidden Android WebView startup", () => {
  it("does not mount a heavy camera panel in background, but resumes on visible frames", () => {
    vi.useFakeTimers();
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const task = vi.fn();
    const cancel = scheduleAfterResponsivePaint(task, {
      stableFrames: 3, maxFrameGapMs: 350, backgroundFallbackMs: 40, visibleOnly: true,
    });
    vi.advanceTimersByTime(500);
    expect(task).not.toHaveBeenCalled();
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    frames.shift()?.(10);
    frames.shift()?.(26);
    frames.shift()?.(42);
    vi.advanceTimersByTime(0);
    expect(task).toHaveBeenCalledOnce();
    cancel();
  });

  it("allows real responsive frames when emulator wrongly reports a hidden WebView", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const task = vi.fn();
    const cancel = scheduleAfterResponsivePaint(task, {
      visibleOnly: true, stableFrames: 3, maxFrameGapMs: 350, backgroundFallbackMs: 40,
    });
    // A falsely-hidden WebView can still paint with a working RAF cadence.
    frames.shift()?.(10);
    frames.shift()?.(26);
    frames.shift()?.(42);
    vi.advanceTimersByTime(0);
    expect(task).toHaveBeenCalledOnce();
    cancel();
  });

  it("does not load the heavy screen from a background timer with stalled RAF", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 91));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const task = vi.fn();
    const cancel = scheduleAfterResponsivePaint(task, {
      visibleOnly: true, backgroundFallbackMs: 20,
    });
    vi.advanceTimersByTime(500);
    expect(task).not.toHaveBeenCalled();
    cancel();
  });

  it("does not accumulate fallback timers in a hidden WebView without RAF", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    vi.stubGlobal("requestAnimationFrame", undefined);
    const task = vi.fn();
    const cancel = scheduleAfterResponsivePaint(task, {
      visibleOnly: true, backgroundFallbackMs: 30,
    });
    vi.advanceTimersByTime(2000);
    expect(task).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    cancel();
  });

  it("never fires a cancelled camera load after coming back from background", () => {
    vi.useFakeTimers();
    let hidden = true;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const task = vi.fn();
    const cancel = scheduleAfterResponsivePaint(task, {
      visibleOnly: true, backgroundFallbackMs: 40,
    });
    cancel();
    vi.advanceTimersByTime(400);
    hidden = false;
    document.dispatchEvent(new Event("visibilitychange"));
    vi.runOnlyPendingTimers();
    expect(task).not.toHaveBeenCalled();
  });
});
