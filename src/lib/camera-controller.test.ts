import { afterEach, describe, expect, it, vi } from "vitest";
import { cameraController, CameraBusyError, checkAppliedCameraSetting, focusPoint } from "./camera-controller";

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
  it("distinguishes a requested setting from a device-confirmed one", () => {
    const c=camera();
    const track=c.track as unknown as MediaStreamTrack;
    c.track.readyState="live";
    Object.assign(c.track, {getSettings: () => ({zoom: 2, focusMode:"continuous"})});
    expect(checkAppliedCameraSetting(track,"zoom",2)).toBe("confirmed");
    expect(checkAppliedCameraSetting(track,"zoom",3)).toBe("rejected");
    expect(checkAppliedCameraSetting(track,"focusMode","continuous")).toBe("confirmed");
    expect(checkAppliedCameraSetting(track,"focusDistance",0.5)).toBe("unknown");
    c.track.readyState="ended";
    expect(checkAppliedCameraSetting(track,"zoom",2)).toBe("unknown");
  });
  it("never generates invalid focus points for a transient zero-size fold viewport", () => {
    const point = focusPoint({left:10,top:20,width:0,height:0},0,0,55,85);
    expect(point).toEqual({x:0.5,y:0.5});
    const invalid=focusPoint({left:NaN,top:0,width:200,height:400},1920,1080,100,150);
    expect(invalid).toEqual({x:0.5,y:0.5});
  });
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

  it("releases the lease after denied camera access", async () => {
    const request = vi.fn().mockRejectedValueOnce(new DOMException("Denied", "NotAllowedError"));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: request } });
    await expect(cameraController.acquire(Symbol("probe"), { video: true }, { preempt: false }))
      .rejects.toMatchObject({ name: "NotAllowedError" });
    const next = camera();
    request.mockResolvedValueOnce(next.stream);
    await expect(cameraController.acquire(Symbol("retry"), { video: true }, { preempt: false }))
      .resolves.toBe(next.stream);
  });

  it("releases the lease after a synchronous camera API exception", async () => {
    const request = vi.fn().mockImplementationOnce(() => { throw new Error("Device unavailable"); });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: request } });
    await expect(cameraController.acquire(Symbol("probe"), { video: true }, { preempt: false }))
      .rejects.toThrow("Device unavailable");
    const next = camera();
    request.mockResolvedValueOnce(next.stream);
    await expect(cameraController.acquire(Symbol("retry"), { video: true }, { preempt: false }))
      .resolves.toBe(next.stream);
  });

  it("rejects settings sent to an old controller-owned stream after capture handoff", async () => {
    const old=camera(), next=camera();
    const request=vi.fn().mockResolvedValueOnce(old.stream).mockResolvedValueOnce(next.stream);
    vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:request}});
    const a=Symbol("A"),b=Symbol("B");
    await cameraController.acquire(a,{video:true});
    await cameraController.acquire(b,{video:true});
    // Even if an OEM reports an already superseded track as live, this track
    // cannot receive old zoom/focus commands.
    old.track.readyState="live";
    await expect(cameraController.apply(old.stream,{zoom:4})).resolves.toBe(false);
    expect(old.track.applyConstraints).not.toHaveBeenCalled();
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

  it("quarantines a timed-out driver command rather than racing the next setting", async () => {
    vi.useFakeTimers();
    const cam = camera();
    let complete!: () => void;
    cam.track.applyConstraints.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:vi.fn().mockResolvedValue(cam.stream)}});
    await cameraController.acquire(Symbol("ui"),{video:true});
    const first = cameraController.apply(cam.stream,{zoom:2});
    await vi.advanceTimersByTimeAsync(40);
    expect(cam.track.applyConstraints).toHaveBeenCalledOnce();
    const pending = cameraController.apply(cam.stream,{zoom:4});
    await vi.advanceTimersByTimeAsync(2600);
    expect(await Promise.all([first,pending])).toEqual([false,false]);
    expect(cam.track.applyConstraints).toHaveBeenCalledOnce();
    await expect(cameraController.apply(cam.stream,{zoom:8})).resolves.toBe(false);
    complete();
    await vi.advanceTimersByTimeAsync(0);
    expect(cam.track.applyConstraints).toHaveBeenCalledOnce();
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
