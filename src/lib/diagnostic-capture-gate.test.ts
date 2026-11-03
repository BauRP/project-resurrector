import { describe, expect, it } from "vitest";
import { DiagnosticCaptureGate, type DiagnosticOperation } from "./diagnostic-capture-gate";
import { readFileSync } from "node:fs";

describe("exclusive camera diagnostic lease", () => {
  it("blocks all competing camera test types until the original finishes", () => {
    const operations: DiagnosticOperation[] =
      ["mode-scan","raw","stabilization","dual","high-speed"];
    for (const first of operations) {
      const gate = new DiagnosticCaptureGate();
      const lease = gate.acquire(first);
      expect(lease).not.toBeNull();
      expect(lease?.isCurrent()).toBe(true);
      for (const other of operations) expect(gate.acquire(other)).toBeNull();
      expect(gate.activeOperation()).toBe(first);
      lease?.release();
      expect(gate.activeOperation()).toBeNull();
      expect(gate.acquire("mode-scan")?.isCurrent()).toBe(true);
    }
  });
  it("stale async completion cannot release a replacement probe after recreation", () => {
    const gate = new DiagnosticCaptureGate();
    const old = gate.acquire("dual")!;
    gate.reset();
    const next = gate.acquire("raw")!;
    old.release();
    expect(next.isCurrent()).toBe(true);
    expect(gate.activeOperation()).toBe("raw");
    next.release();
    next.release();
    expect(gate.activeOperation()).toBeNull();
  });
  it("all camera-opening diagnostic paths use one lease and recheck safety", () => {
    const code = readFileSync("src/components/multicam/CameraDiagnostics.tsx", "utf8");
    for (const op of ["mode-scan", "raw", "stabilization", "dual", "high-speed"]) {
      expect(code).toContain('gate.current.acquire("' + op + '")');
    }
    expect(code).toContain("if (!await safeToProbe(lease, true))");
    expect(code.match(/if \(!await safeToProbe\(lease, false\)\)/g)).toHaveLength(2);
    expect(code).toContain("if (!await safeToProbe(lease, false) || test.signal.aborted)");
    expect(code).toContain("highSpeedLease.current?.release()");
    expect(code).toContain("lease.release()");
  });
});
