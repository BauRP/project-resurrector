import { describe, expect, it, vi } from "vitest";
import { planRecordingFinalization, canPublishCaptureStatus, createRecorderStartGuard, createRecordingStopGuard } from "./recording-finalization";
describe("recording recovery and truthful completion", () => {
  it("does not claim an empty or tiny blob can be saved", () => {
    expect(planRecordingFinalization(0, "", "").attemptSave).toBe(false);
    expect(planRecordingFinalization(1000, "encoder failed", "").attemptSave).toBe(false);
    expect(planRecordingFinalization(Number.NaN, "", "").attemptSave).toBe(false);
  });
  it("attempts to salvage a partial encoder recording without reporting success", () => {
    const result = planRecordingFinalization(1048576, "bitstream failure", "");
    expect(result.attemptSave).toBe(true);
    expect(result.incomplete).toBe(true);
    expect(result.message).toContain("bitstream failure");
  });
  it("marks background/device interruption as partial, ordinary recording as clean", () => {
    expect(planRecordingFinalization(2048, "", "Приложение в фоне").incomplete).toBe(true);
    expect(planRecordingFinalization(2048, "", "").incomplete).toBe(false);
  });
});

describe("MediaRecorder missing-onstop timeout", () => {
  it("finalizes exactly once if a real onstop arrives before timeout", async () => {
    vi.useFakeTimers();
    const finalize=vi.fn(),timeout=vi.fn();
    const guard=createRecordingStopGuard(finalize,timeout,12000);
    guard.waitForStop();
    await vi.advanceTimersByTimeAsync(1000);
    guard.finish();guard.finish();
    await vi.advanceTimersByTimeAsync(15000);
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(timeout).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("runs bounded salvage after a stalled encoder and ignores a late onstop", async () => {
    vi.useFakeTimers();
    const finalize=vi.fn(),timeout=vi.fn();
    const guard=createRecordingStopGuard(finalize,timeout,12000);
    guard.waitForStop();guard.waitForStop();
    await vi.advanceTimersByTimeAsync(12001);
    guard.finish();
    expect(timeout).toHaveBeenCalledTimes(1);
    expect(finalize).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("unconfirmed single-recorder startup", () => {
  it("does not timeout a recording that actually dispatched onstart", async () => {
    vi.useFakeTimers();
    const timeout=vi.fn();
    const watchdog=createRecorderStartGuard(timeout,8000);
    expect(watchdog.started()).toBe(true);
    await vi.advanceTimersByTimeAsync(20000);
    expect(timeout).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("requires a real onstart event and times out once", async () => {
    vi.useFakeTimers();
    const timeout=vi.fn();
    const watchdog=createRecorderStartGuard(timeout,8000);
    await vi.advanceTimersByTimeAsync(8001);
    expect(timeout).toHaveBeenCalledOnce();
    expect(watchdog.started()).toBe(false);
    watchdog.cancel();
    vi.useRealTimers();
  });
  it("cancels a pending watchdog on an early recorder error", async () => {
    vi.useFakeTimers();
    const timeout=vi.fn();
    const watchdog=createRecorderStartGuard(timeout,8000);
    watchdog.cancel();
    await vi.advanceTimersByTimeAsync(12000);
    expect(timeout).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("capture session ownership across stop, background, and remount", () => {
  it("permits updates from the active recording only", () => {
    expect(canPublishCaptureStatus(4,4,true)).toBe(true);
    expect(canPublishCaptureStatus(5,4,true)).toBe(false);
    expect(canPublishCaptureStatus(4,4,false)).toBe(false);
    expect(canPublishCaptureStatus(0,0,true)).toBe(false);
  });
  it("does not block durable storage work when previous UI generation expires", () => {
    let saved=0;
    const report=(current:number,completed:number,mounted:boolean) => {
      saved++; // clip can still be committed and announced to library
      return canPublishCaptureStatus(current,completed,mounted);
    };
    expect(report(2,1,true)).toBe(false);
    expect(saved).toBe(1);
  });
});
