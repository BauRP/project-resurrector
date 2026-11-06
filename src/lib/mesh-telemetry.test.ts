import { afterEach, describe, expect, it, vi } from "vitest";
import { isValidMeshMessage, mesh } from "./mesh";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("bounded camera peer telemetry under Android WebView stalls", () => {
  it("still announces a peer when battery and storage queries never resolve", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    vi.stubGlobal("navigator",{
      getBattery: () => never,
      storage: {estimate: () => never},
    });
    const send = vi.spyOn(mesh,"send").mockImplementation(() => undefined);
    const pending = mesh.sendTelemetry();
    await vi.advanceTimersByTimeAsync(1600);
    const result = await pending;
    expect(result).toEqual({battery:null,storageMB:null});
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toMatchObject({
      type:"telemetry",battery:null,storageMB:null,
    });
    expect(isValidMeshMessage(send.mock.calls[0]![0])).toBe(true);
  });
  it("coalesces simultaneous camera and mesh monitoring without dropping measurements", async () => {
    vi.useFakeTimers();
    let release: ((value: {level:number}) => void) | undefined;
    const getBattery = vi.fn(() => new Promise<{level:number}>(resolve => { release = resolve; }));
    vi.stubGlobal("navigator",{
      getBattery,
      storage: {estimate: async () => ({quota:83886080,usage:10485760})},
    });
    const send = vi.spyOn(mesh,"send").mockImplementation(() => undefined);
    const first = mesh.sendTelemetry();
    const second = mesh.sendTelemetry();
    expect(first).toBe(second);
    expect(getBattery).toHaveBeenCalledTimes(1);
    release?.({level:.6});
    const result = await first;
    expect(result).toEqual({battery:60,storageMB:70});
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("clamps invalid device metrics instead of emitting rejected telemetry", async () => {
    vi.stubGlobal("navigator",{
      getBattery:async()=>({level:3}),
      storage:{estimate:async()=>({quota:100,usage:1000})},
    });
    const send=vi.spyOn(mesh,"send").mockImplementation(()=>undefined);
    const result=await mesh.sendTelemetry();
    expect(result).toEqual({battery:100,storageMB:0});
    expect(isValidMeshMessage(send.mock.calls[0]![0])).toBe(true);
  });
});
