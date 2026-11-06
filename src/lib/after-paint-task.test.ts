import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleAfterPaintTask } from "./after-paint-task";

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
