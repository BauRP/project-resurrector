import { describe, expect, it } from "vitest";
import { normalizeFoldTransition, appendFoldTransition, foldContinuitySummary } from "./fold-recording-evidence";

const sample = { revision: 1, posture: "HALF_OPENED", hingeCount: 1, usableRegions: 2, layout: "vertical" };
describe("fold events attached to capture", () => {
  it("rejects incomplete and fabricated geometry", () => {
    expect(normalizeFoldTransition({}, 100)).toBe(null);
    expect(normalizeFoldTransition({...sample, usableRegions: 0},100)).toBe(null);
    expect(normalizeFoldTransition(sample,100)?.hingeCount).toBe(1);
  });
  it("deduplicates updates and retains true transitions in order", () => {
    const first = normalizeFoldTransition(sample, 100)!;
    const one = appendFoldTransition([],first);
    const again = appendFoldTransition(one,{...first,observedAtMs:150});
    expect(again).toHaveLength(1);
    const opened = appendFoldTransition(again,{...first,revision:2,posture:"FLAT",observedAtMs:220});
    expect(opened).toHaveLength(2);
    expect(foldContinuitySummary(opened)).toContain("1");
    expect(foldContinuitySummary([])).toContain("не подтверждена");
  });
});
