import { afterEach, describe, expect, it, vi } from "vitest";
import { isRetryableCameraPreviewError, previewRetryDelay, startNativeStatusRecovery } from "./camera-availability-retry";

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("emulator camera is optional and does not affect other tabs", () => {
  it("retries an unavailable Camera2 status with bounded, increasing backoff and no overlapping requests", async () => {
    vi.useFakeTimers();
    let fail!: (error: Error) => void;
    const pending = new Promise<{state:string}>((_, reject) => { fail = reject; });
    const read = vi.fn().mockReturnValueOnce(pending).mockRejectedValueOnce(Error("unavailable"))
      .mockResolvedValue({state:"idle"});
    const onStatus = vi.fn();
    const onFail = vi.fn();
    const stop = startNativeStatusRecovery(read, onStatus, onFail);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(read).toHaveBeenCalledTimes(1);
    fail(Error("Camera2 timeout"));
    await Promise.resolve();
    expect(onFail).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3499);
    expect(read).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6999);
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(read).toHaveBeenCalledTimes(3);
    expect(onStatus).toHaveBeenCalledWith({state:"idle"});
    stop();
  });
  it("stops pending retries on navigation and ignores late Camera2 replies", async () => {
    vi.useFakeTimers();
    const onStatus=vi.fn(),onFail=vi.fn();
    let resolve!: (status:{state:string})=>void;
    const read=vi.fn(()=>new Promise<{state:string}>(r=>{resolve=r;}));
    const stop=startNativeStatusRecovery(read,onStatus,onFail);
    stop(); resolve({state:"recording"});
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60000);
    expect(read).toHaveBeenCalledTimes(1);
    expect(onStatus).not.toHaveBeenCalled();
    expect(onFail).not.toHaveBeenCalled();
  });
  it("never repeats Android camera permission prompts or wrong-lens requests", () => {
    expect(isRetryableCameraPreviewError(new DOMException("denied","NotAllowedError"))).toBe(false);
    expect(isRetryableCameraPreviewError({name:"SecurityError"})).toBe(false);
    expect(isRetryableCameraPreviewError({name:"OverconstrainedError"})).toBe(false);
    expect(isRetryableCameraPreviewError(Error("Native Camera2 timeout"))).toBe(true);
    expect(previewRetryDelay(1)).toBe(5000);
    expect(previewRetryDelay(2)).toBe(10000);
    expect(previewRetryDelay(3)).toBe(20000);
    expect(previewRetryDelay(4)).toBeNull();
  });
});
