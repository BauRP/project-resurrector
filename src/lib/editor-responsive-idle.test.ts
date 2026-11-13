import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForEditorResponsiveIdle } from "./editor-responsive-idle";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Editor waveform decode is deferred until responsive WebView frames", () => {
  it("waits for the Editor's media initialization and four responsive frames", async () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
      frames.push(frame);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const complete = vi.fn();
    const pending = waitForEditorResponsiveIdle().then(complete);
    await vi.advanceTimersByTimeAsync(549);
    expect(frames).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(frames).toHaveLength(1);
    for (let i = 0; i < 3; i++) {
      frames.shift()?.(16 * (i + 1));
      await vi.advanceTimersByTimeAsync(0);
      expect(complete).not.toHaveBeenCalled();
    }
    frames.shift()?.(64);
    await vi.advanceTimersByTimeAsync(0);
    await pending;
    expect(complete).toHaveBeenCalledWith(true);
  });

  it("loads media after steady frames if Android falsely reports hidden", async () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (frame: FrameRequestCallback) => {
      frames.push(frame); return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const pending = waitForEditorResponsiveIdle();
    await vi.advanceTimersByTimeAsync(550);
    for (const t of [40, 80, 120, 160]) {
      frames.shift()?.(t);
      await vi.advanceTimersByTimeAsync(0);
    }
    await expect(pending).resolves.toBe(true);
  });
  it("cancels the pending decoder when user leaves Editor", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const complete = waitForEditorResponsiveIdle(controller.signal);
    controller.abort();
    await expect(complete).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
  });

  it("does not schedule a decoder when already cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(waitForEditorResponsiveIdle(controller.signal)).resolves.toBe(false);
  });
});
