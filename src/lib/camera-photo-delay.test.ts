import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { waitForPhotoDelay } from "./camera-photo-delay";

afterEach(() => { vi.useRealTimers(); });

describe("Astra: photo countdown never runs after Camera exits", () => {
  it("completes an active shutter timer normally", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const pending = waitForPhotoDelay(1000, abort.signal);
    await vi.advanceTimersByTimeAsync(999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels countdown or burst pause and removes its timer", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const pending = waitForPhotoDelay(10000, abort.signal);
    abort.abort();
    expect(await pending).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(20000);
    expect(await waitForPhotoDelay(1000, abort.signal)).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("keeps all photo modes but blocks old commands after unmount", () => {
    const camera = readFileSync("src/components/multicam/CameraTab.tsx", "utf8");
    expect(camera).toContain("photoCountdown.current?.abort()");
    expect(camera).toContain("activePhoto.current?.abort()");
    expect(camera).toContain("if (request.signal.aborted || !cameraMounted.current) return;");
    expect(camera).toContain("if (countdown || photoCountdown.current) return;");
    expect(camera).toContain("waitForPhotoDelay(1000, request.signal)");
    expect(camera).toContain("waitForPhotoDelay(400, photoAbort.signal)");
    expect(camera).toContain("waitForPhotoDelay(120, photoAbort.signal)");
    expect(camera).toContain("if (cameraMounted.current) void shootOnce()");
    expect(camera).toContain("if (intervalRef.current) window.clearInterval(intervalRef.current)");
    expect(camera).toContain("if (photoAbort.signal.aborted || !cameraMounted.current) return;");
    expect(camera).toContain("if (!photoAbort.signal.aborted && cameraMounted.current)");
  });
});
