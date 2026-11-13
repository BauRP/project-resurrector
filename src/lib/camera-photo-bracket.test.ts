import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { runExposureBracket } from "./camera-photo-bracket";

afterEach(() => { vi.useRealTimers(); });

describe("Astra Camera2/WebView photo-bracket cleanup", () => {
  it("retains all three exposure frames and restores zero EV", async () => {
    vi.useFakeTimers();
    const apply = vi.fn(async (_ev: number) => true);
    const capture = vi.fn(async () => new Blob(["frame"]));
    const pending = runExposureBracket([-2, 0, 2], apply, capture, new AbortController().signal, () => true);
    await vi.advanceTimersByTimeAsync(1200);
    const shots = await pending;
    expect(shots).toHaveLength(3);
    expect(capture).toHaveBeenCalledTimes(3);
    expect(apply.mock.calls.map(([ev]) => ev)).toEqual([-2, 0, 2, 0]);
  });

  it("restores exposure when capturing the second photo throws", async () => {
    vi.useFakeTimers();
    const apply = vi.fn(async (_ev: number) => true);
    const capture = vi.fn()
      .mockResolvedValueOnce(new Blob(["first"]))
      .mockRejectedValueOnce(new Error("WebView frame decoder stopped"));
    const pending = runExposureBracket([-2, 0, 2], apply, capture, new AbortController().signal, () => true);
    const rejected = expect(pending).rejects.toThrow("WebView frame decoder stopped");
    await vi.advanceTimersByTimeAsync(800);
    await rejected;
    expect(apply.mock.calls.map(([ev]) => ev)).toEqual([-2, 0, 0]);
  });

  it("restores exposure if the camera applies EV then reports an error", async () => {
    const apply = vi.fn(async (ev: number) => {
      if (ev === -2) throw new Error("Camera HAL rejected EV");
    });
    await expect(runExposureBracket([-2, 0, 2], apply, vi.fn(), new AbortController().signal, () => true))
      .rejects.toThrow("Camera HAL rejected EV");
    expect(apply.mock.calls.map(([ev]) => ev)).toEqual([-2, 0]);
  });

  it("does not touch the replaced stream after cancellation", async () => {
    vi.useFakeTimers();
    const ctrl = new AbortController();
    let current = true;
    const apply = vi.fn(async (_ev: number) => true);
    const capture = vi.fn(async () => new Blob(["photo"]));
    const pending = runExposureBracket([-2, 0, 2], apply, capture, ctrl.signal, () => current);
    await vi.advanceTimersByTimeAsync(100);
    current = false;
    ctrl.abort();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toEqual([]);
    expect(apply.mock.calls.map(([ev]) => ev)).toEqual([-2]);
    expect(capture).not.toHaveBeenCalled();
  });

  it("preserves 3 frames when exposure controls are not supported", async () => {
    vi.useFakeTimers();
    const apply = vi.fn();
    const capture = vi.fn(async () => new Blob(["frame"]));
    const pending = runExposureBracket([-2, 0, 2], apply, capture, new AbortController().signal, () => true, false);
    await vi.advanceTimersByTimeAsync(1200);
    expect(await pending).toHaveLength(3);
    expect(apply).not.toHaveBeenCalled();
  });

  it("stays bound to the latest MediaStream owner in CameraTab", () => {
    const source = readFileSync("src/components/multicam/CameraTab.tsx", "utf8");
    expect(source).toContain("latestPhotoStream.current === stream");
    expect(source).toContain("runExposureBracket(");
    expect(source).toContain("shots.push(...bracket)");
  });
});
