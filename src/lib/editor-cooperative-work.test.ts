import { afterEach, describe, expect, it, vi } from "vitest";
import { runEditorQuietMediaWork } from "./editor-cooperative-work";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("foreground-priority editor media jobs", () => {
  it("restarts an interrupted thumbnail/proxy attempt without losing quality or leaving timers", async () => {
    vi.useFakeTimers();
    const session = new AbortController();
    let attempts = 0;
    let complete!: (value: string) => void;
    const pending = runEditorQuietMediaWork(session.signal, () => false, signal => {
      attempts++;
      return new Promise<string>((resolve, reject) => {
        complete = resolve;
        signal.addEventListener("abort", () => reject(new Error("cancelled codec")), { once: true });
      });
    }, 500);

    await vi.advanceTimersByTimeAsync(550);
    expect(attempts).toBe(1);
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(300);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(attempts).toBe(2);
    complete("original-quality-output");
    await expect(pending).resolves.toBe("original-quality-output");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for playback to finish and cancels promptly on navigation", async () => {
    vi.useFakeTimers();
    const session = new AbortController();
    let playing = true;
    const work = vi.fn(async () => "ready");
    const pending = runEditorQuietMediaWork(session.signal, () => playing, work, 500);
    await vi.advanceTimersByTimeAsync(2000);
    expect(work).not.toHaveBeenCalled();
    playing = false;
    await vi.advanceTimersByTimeAsync(250);
    expect(await pending).toBe("ready");
    expect(work).toHaveBeenCalledTimes(1);

    const another = new AbortController();
    const blocked = runEditorQuietMediaWork(another.signal, () => true, work, 500);
    another.abort();
    await expect(blocked).resolves.toBeUndefined();
    expect(work).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates codec errors rather than retrying them forever", async () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    const work = vi.fn(async () => { throw new Error("codec unavailable"); });
    const pending = runEditorQuietMediaWork(ctrl.signal, () => false, work, 500);
    const rejection = expect(pending).rejects.toThrow("codec unavailable");
    await vi.advanceTimersByTimeAsync(500);
    await rejection;
    expect(work).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
