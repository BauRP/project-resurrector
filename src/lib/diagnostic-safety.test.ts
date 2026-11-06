import { expect, it, describe } from "vitest";
import { diagnosticProbeLimit, evaluateDiagnosticSafety, nativeDiagnosticAvailability } from "./diagnostic-safety";
describe("bounded camera diagnostics", () => {
  it("defers extended probes on Android severe thermal throttling", () => {
    const result = evaluateDiagnosticSafety({thermalStatus:3,battery:{level:.9,charging:true},freeBytes:1024**3,extended:true});
    expect(result.proceed).toBe(false); expect(result.thermal).toBe("danger");
  });
  it("defers tests on unsafe battery or insufficient storage", () => {
    const result = evaluateDiagnosticSafety({thermalStatus:0,battery:{level:.09,charging:false},freeBytes:40*1024**2,extended:true});
    expect(result.proceed).toBe(false); expect(result.battery).toBe("low"); expect(result.storage).toBe("low");
  });
  it("does not pretend unsupported temperature/battery queries are reliable", () => {
    const result = evaluateDiagnosticSafety({thermalStatus:null,battery:null,freeBytes:null,extended:true});
    expect(result.proceed).toBe(true);
    expect(result.thermal).toBe("unknown"); expect(result.battery).toBe("unknown");
    expect(result.reason).toContain("неизвестна");
  });
});

describe("conservative resource-unknown diagnostic budget",()=>{
  it("runs only one probe when an essential safety signal is unknown",()=>{
    expect(diagnosticProbeLimit({proceed:true,reason:"",thermal:"unknown",battery:"safe",storage:"safe"},20)).toBe(1);
    expect(diagnosticProbeLimit({proceed:true,reason:"",thermal:"safe",battery:"safe",storage:"safe"},20)).toBe(20);
    expect(diagnosticProbeLimit({proceed:false,reason:"hot",thermal:"danger",battery:"safe",storage:"safe"},20)).toBe(0);
  });
});

describe("Camera2 ownership fence for diagnostics",()=>{
  it("refuses diagnostic camera opening while the native service still owns or finalizes media",()=>{
    for (const state of ["starting","previewing","recording","paused","stopping","saving","finalizing"])
      expect(nativeDiagnosticAvailability(state)).toBe("busy");
    expect(nativeDiagnosticAvailability(null)).toBe("unknown");
    expect(nativeDiagnosticAvailability("unrecognized-oem-state")).toBe("unknown");
  });
  it("permits a new diagnostic only after the native service is terminal",()=>{
    for (const state of ["idle","error","interrupted","stopped","completed"])
      expect(nativeDiagnosticAvailability(state)).toBe("free");
  });
});
