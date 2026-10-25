import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraController, CameraBusyError } from "./camera-controller";

function camera() {
  const track = {
    readyState: "live" as MediaStreamTrackState,
    stop: vi.fn(function (this: { readyState: MediaStreamTrackState }) { this.readyState = "ended"; }),
    applyConstraints: vi.fn(async () => undefined),
  };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream;
  return { stream, track };
}

afterEach(() => {
  cameraController.release();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("camera ownership and serialized settings", () => {
  it("does not allow a diagnostic test to evict the active user camera", async () => {
    const userCamera = camera();
    const getUserMedia = vi.fn().mockResolvedValue(userCamera.stream);
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const user = Symbol("user");
    await cameraController.acquire(user, { video: true });
    await expect(cameraController.acquire(Symbol("probe"), { video: true }, { preempt: false }))
      .rejects.toBeInstanceOf(CameraBusyError);
    expect(userCamera.track.stop).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    cameraController.release(user);
    expect(userCamera.track.stop).toHaveBeenCalledOnce();
  });

  it("coalesces rapid settings without concurrent hardware commands", async () => {
    vi.useFakeTimers();
    const cam = camera();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(cam.stream) } });
    await cameraController.acquire(Symbol("ui"), { video: true });
    const first = cameraController.apply(cam.stream, { iso: 100 });
    const next = cameraController.apply(cam.stream, { exposureTime: 200 });
    await vi.advanceTimersByTimeAsync(40);
    expect(await Promise.all([first, next])).toEqual([true, true]);
    expect(cam.track.applyConstraints).toHaveBeenCalledOnce();
    expect(cam.track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ iso: 100, exposureTime: 200 }] });
  });

  it("rejects results from a slow camera driver after release", async () => {
    vi.useFakeTimers();
    const cam = camera();
    let finish!: () => void;
    cam.track.applyConstraints.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(cam.stream) } });
    const owner = Symbol("ui");
    await cameraController.acquire(owner, { video: true });
    const pending = cameraController.apply(cam.stream, { iso: 400 });
    await vi.advanceTimersByTimeAsync(40);
    expect(cam.track.applyConstraints).toHaveBeenCalledOnce();
    cameraController.release(owner);
    expect(await pending).toBe(false);
    expect(await cameraController.apply(cam.stream, { iso: 800 })).toBe(false);
    finish();
    await vi.advanceTimersByTimeAsync(0);
  });
});
