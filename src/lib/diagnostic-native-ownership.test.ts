import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./native",()=>({
  isNative:()=>true,
  MultiCamNative:{getThermalStatus:vi.fn(async()=>({available:true,status:0}))},
}));
vi.mock("./native-capture",()=>({
  nativeRecorderOwnsCamera:(state:string)=>["starting","previewing","recording","paused","stopping"].includes(state),
  nativeCapture:{status:vi.fn()},
}));
import { checkDiagnosticSafety } from "./diagnostic-safety";
import { nativeCapture } from "./native-capture";

describe("native capture must remain sole owner during camera diagnostics",()=>{
  it("does not open an additional camera while service reports recording",async()=>{
    vi.mocked(nativeCapture.status).mockResolvedValue({state:"recording"} as Awaited<ReturnType<typeof nativeCapture.status>>);
    const safety=await checkDiagnosticSafety(true);
    expect(safety.proceed).toBe(false);
    expect(safety.reason).toContain("Camera2");
  });
  it("never guesses native camera is free when its status query fails",async()=>{
    vi.mocked(nativeCapture.status).mockRejectedValue(new Error("binder unavailable"));
    const safety=await checkDiagnosticSafety(false);
    expect(safety.proceed).toBe(false);
    expect(safety.reason).toContain("неизвестно");
  });
  it("allows bounded diagnostic probes after the native service becomes idle",async()=>{
    vi.mocked(nativeCapture.status).mockResolvedValue({state:"idle"} as Awaited<ReturnType<typeof nativeCapture.status>>);
    const safety=await checkDiagnosticSafety(false);
    expect(safety.proceed).toBe(true);
  });
});

afterEach(()=>{
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("time-bounded safety checks cannot strand the shared camera lease",()=>{
  it("fails closed after a hanging Android binder status request",async()=>{
    vi.useFakeTimers();
    vi.mocked(nativeCapture.status).mockImplementation(()=>new Promise(()=>undefined));
    const safety=checkDiagnosticSafety(true);
    await vi.advanceTimersByTimeAsync(2100);
    const result=await safety;
    expect(result.proceed).toBe(false);
    expect(result.reason).toContain("неизвестно");
  });
  it("returns unknown battery and storage rather than hanging on OEM resource APIs",async()=>{
    vi.useFakeTimers();
    const never=new Promise<never>(()=>undefined);
    vi.mocked(nativeCapture.status).mockResolvedValue({state:"idle"} as Awaited<ReturnType<typeof nativeCapture.status>>);
    vi.stubGlobal("navigator",{
      getBattery:()=>never,
      storage:{estimate:()=>never},
    });
    const safety=checkDiagnosticSafety(true);
    await vi.advanceTimersByTimeAsync(1700);
    const result=await safety;
    expect(result.proceed).toBe(true);
    expect(result.battery).toBe("unknown");
    expect(result.storage).toBe("unknown");
  });
});
