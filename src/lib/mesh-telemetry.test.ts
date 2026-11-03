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
