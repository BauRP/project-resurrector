import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./native",()=>({
  isNative:()=>true,
  MultiCamNative:{getThermalStatus:vi.fn(async()=>({available:true,status:0})),getDiagnosticResources:vi.fn(async()=>({batteryLevel:null,charging:null,freeBytes:null}))},
}));
vi.mock("./native-capture",()=>({
  nativeRecorderOwnsCamera:(state:string)=>["starting","previewing","recording","paused","stopping"].includes(state),
  nativeCapture:{status:vi.fn()},
}));
import { checkDiagnosticSafety } from "./diagnostic-safety";
import { nativeCapture } from "./native-capture";
import { MultiCamNative } from "./native";

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
    vi.mocked(nativeCapture.status).mockResolvedValue({state:"idle",captureServiceActive:false} as Awaited<ReturnType<typeof nativeCapture.status>>);
    const safety=await checkDiagnosticSafety(false);
    expect(safety.proceed).toBe(true);
  });
});

afterEach(()=>{
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(MultiCamNative.getDiagnosticResources).mockResolvedValue({batteryLevel:null,charging:null,freeBytes:null});
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
    vi.mocked(nativeCapture.status).mockResolvedValue({state:"idle",captureServiceActive:false} as Awaited<ReturnType<typeof nativeCapture.status>>);
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

describe("actual Android recording volume and power",()=>{
 it("uses Android battery and disk instead of the browser quota",async()=>{
  vi.mocked(nativeCapture.status).mockResolvedValue({state:"idle",captureServiceActive:false} as Awaited<ReturnType<typeof nativeCapture.status>>);
  vi.stubGlobal("navigator",{storage:{estimate:async()=>({quota:1024**3,usage:0})}});
  vi.mocked(MultiCamNative.getDiagnosticResources).mockResolvedValue({batteryLevel:.08,charging:false,freeBytes:40*1024**2});
  expect(await checkDiagnosticSafety(true)).toMatchObject({proceed:false,battery:"low",storage:"low"});
  vi.mocked(MultiCamNative.getDiagnosticResources).mockResolvedValue({batteryLevel:.8,charging:false,freeBytes:1024**3});
  expect(await checkDiagnosticSafety(true)).toMatchObject({proceed:true,battery:"safe",storage:"safe"});
 });
 it("does not use browser estimates when Android resources cannot be read",async()=>{
  vi.mocked(nativeCapture.status).mockResolvedValue({state:"idle",captureServiceActive:false} as Awaited<ReturnType<typeof nativeCapture.status>>);
  vi.stubGlobal("navigator",{getBattery:async()=>({level:1,charging:true}),storage:{estimate:async()=>({quota:1024**3,usage:0})}});
  vi.mocked(MultiCamNative.getDiagnosticResources).mockRejectedValueOnce(new Error("unavailable"));
  expect(await checkDiagnosticSafety(true)).toMatchObject({proceed:true,battery:"unknown",storage:"unknown"});
 });
});
