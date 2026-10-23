import { expect, it, describe } from "vitest";
import { evaluateDiagnosticSafety } from "./diagnostic-safety";
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
