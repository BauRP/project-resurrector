import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleAfterPaintTask, scheduleAfterResponsivePaint } from "./after-paint-task";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

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
