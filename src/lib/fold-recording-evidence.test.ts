import { describe, expect, it } from "vitest";
import { normalizeFoldTransition, appendFoldTransition, foldContinuitySummary, validFoldRegionGeometry } from "./fold-recording-evidence";

const sample = { revision: 1, posture: "HALF_OPENED", hingeCount: 1, usableRegions: 2, layout: "vertical" };
describe("fold events attached to capture", () => {
  it("rejects incomplete and fabricated geometry", () => {
    expect(normalizeFoldTransition({}, 100)).toBe(null);
    expect(normalizeFoldTransition({...sample, usableRegions: 0},100)).toBe(null);
    expect(normalizeFoldTransition(sample,100)?.hingeCount).toBe(1);
    expect(normalizeFoldTransition({...sample,hingeCount:999},100)).toBe(null);
    expect(normalizeFoldTransition({...sample,usableRegions:999},100)).toBe(null);
    expect(normalizeFoldTransition(sample,Number.NaN)).toBe(null);
    expect(normalizeFoldTransition(sample,-1)).toBe(null);
    expect(normalizeFoldTransition({...sample,posture:"x".repeat(600)},100)).toBe(null);
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

describe("measured fold geometry validation", () => {
  it("accepts measured pane rectangles while rejecting corrupted or impossible values", () => {
    expect(validFoldRegionGeometry("0,0,280,400;285,0,280,400")).toBe(true);
    for (const broken of ["", "x,y,z", "0,0,0,400", "-1,0,100,400",
      "0,0,Infinity,400", "0,0,280,400;", "0,0,280,400;garbage"]) {
      expect(validFoldRegionGeometry(broken)).toBe(false);
      expect(normalizeFoldTransition({...sample,regionGeometry:broken},101)).toBe(null);
    }
  });
});
describe("native fold event chronology", () => {
  it("rejects late older revisions but preserves same-revision viewport changes", () => {
    const current=normalizeFoldTransition({revision:10,posture:"FLAT",hingeCount:1,
      usableRegions:2,layout:"vertical",regionGeometry:"0,0,280,400;285,0,280,400"},100)!;
    const outdated={...current,revision:9,observedAtMs:101,regionGeometry:"0,0,200,400"};
    expect(appendFoldTransition([current],outdated)).toEqual([current]);
    const resized={...current,observedAtMs:102,regionGeometry:"0,0,320,400;325,0,320,400"};
    expect(appendFoldTransition([current],resized)).toEqual([current,resized]);
  });
});
describe("unchanged physical fold with a new native revision", () => {
  it("does not count revision-only native updates as a second fold", () => {
    const initial=normalizeFoldTransition({...sample,revision:10,regionGeometry:"0,0,280,400"},100)!;
    const repeated=normalizeFoldTransition({...sample,revision:11,regionGeometry:"0,0,280,400"},120)!;
    const journal=appendFoldTransition([initial],repeated);
    expect(journal).toHaveLength(1);
    expect(journal[0]?.revision).toBe(11);
    expect(appendFoldTransition(journal,{...repeated,revision:10,observedAtMs:130,
      regionGeometry:"0,0,260,400"})).toEqual(journal);
    const moved={...repeated,revision:11,observedAtMs:140,regionGeometry:"0,0,300,400"};
    expect(appendFoldTransition(journal,moved)).toHaveLength(2);
  });
});
describe("geometry changes during actual fold recording", () => {
  it("retains a resize with an unchanged native revision but changed region dimensions", () => {
    const a=normalizeFoldTransition({revision:2,posture:"FLAT",hingeCount:1,
      usableRegions:2,layout:"vertical",regionGeometry:"0,0,250,400;255,0,250,400"},100)!;
    const b=normalizeFoldTransition({...a,regionGeometry:"0,0,280,400;285,0,280,400"},101)!;
    expect(appendFoldTransition([a],b)).toHaveLength(2);
    expect(appendFoldTransition([a],a)).toHaveLength(1);
    expect(normalizeFoldTransition({...a,regionGeometry:"x".repeat(600)},100)).toBe(null);
  });
});


describe("fold pane region authenticity", () => {
  it("rejects overlapping screen areas and overflowing coordinate sums", () => {
    expect(validFoldRegionGeometry("0,0,300,400;250,0,300,400")).toBe(false);
    expect(validFoldRegionGeometry("9007199254740990,0,100,400")).toBe(false);
    expect(validFoldRegionGeometry("0,0,300,400;300,0,300,400")).toBe(true);
  });
  it("does not attach impossible overlapping panes to a recording", () => {
    expect(normalizeFoldTransition({...sample,regionGeometry:"0,0,300,400;150,0,300,400"},101)).toBe(null);
  });
});
