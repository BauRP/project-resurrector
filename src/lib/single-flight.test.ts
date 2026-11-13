import { describe, expect, it, vi, afterEach } from "vitest";
import { createSingleFlight } from "./single-flight";
import { bounded } from "./async";

afterEach(() => vi.useRealTimers());

describe("Astra: bound Camera2 Binder status traffic to a single native request", () => {
  it("shares a still-running native query across all waiting camera screens", async () => {
    let resolve!: (v: string) => void;
    const raw=vi.fn(() => new Promise<string>(r => { resolve=r; }));
    const query=createSingleFlight(raw);
    const a=query(), b=query(), c=query();
    expect(a).toBe(b); expect(b).toBe(c);
    await Promise.resolve();
    expect(raw).toHaveBeenCalledOnce();
    resolve("recording");
    expect(await a).toBe("recording");
    expect(await b).toBe("recording");
    expect(await c).toBe("recording");
    await Promise.resolve();
    await query();
    expect(raw).toHaveBeenCalledTimes(2);
  });
  it("a timed-out caller does not start another native query until Android returns", async () => {
    vi.useFakeTimers();
    let resolve!: (v: string) => void;
    const raw=vi.fn(() => new Promise<string>(r => { resolve=r; }));
    const query=createSingleFlight(raw);
    const timeout=expect(bounded(query(), 100, "Camera2 status")).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(100);
    await timeout;
    const later=query();
    expect(raw).toHaveBeenCalledOnce();
    resolve("idle");
    expect(await later).toBe("idle");
    await query();
    expect(raw).toHaveBeenCalledTimes(2);
  });
  it("a failed Android bridge releases the lease for the next Activity", async () => {
    const raw=vi.fn().mockRejectedValueOnce(Error("Activity destroyed")).mockResolvedValueOnce("idle");
    const query=createSingleFlight<string>(raw);
    await expect(query()).rejects.toThrow("Activity destroyed");
    await expect(query()).resolves.toBe("idle");
    expect(raw).toHaveBeenCalledTimes(2);
  });
  it("also recovers if the native call throws synchronously", async () => {
    const raw=vi.fn().mockImplementationOnce(() => { throw Error("Native bridge missing"); })
      .mockResolvedValueOnce("ready");
    const query=createSingleFlight<string>(raw);
    await expect(query()).rejects.toThrow("Native bridge missing");
    await expect(query()).resolves.toBe("ready");
  });
});
