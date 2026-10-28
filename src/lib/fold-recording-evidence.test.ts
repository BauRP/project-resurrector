import { describe, expect, it } from "vitest";
import { normalizeFoldTransition, appendFoldTransition, foldContinuitySummary, validFoldRegionGeometry, rememberActiveFoldSnapshot, forgetActiveFoldSnapshot, getActiveFoldBaseline } from "./fold-recording-evidence";
import type { FoldTransitionEvidence } from "./fold-recording-evidence";

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
    expect(foldContinuitySummary(opened)).toContain("Зафиксировано изменений геометрии: 2");
    expect(foldContinuitySummary(opened)).toContain("частично неизвестно");
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
    const initial=normalizeFoldTransition({...sample,revision:10,regionGeometry:"0,0,280,400;285,0,280,400"},100)!;
    const repeated=normalizeFoldTransition({...sample,revision:11,regionGeometry:"0,0,280,400;285,0,280,400"},120)!;
    const journal=appendFoldTransition([initial],repeated);
    expect(journal).toHaveLength(1);
    expect(journal[0]?.revision).toBe(11);
    expect(appendFoldTransition(journal,{...repeated,revision:10,observedAtMs:130,
      regionGeometry:"0,0,260,400"})).toEqual(journal);
    const moved={...repeated,revision:11,observedAtMs:140,regionGeometry:"0,0,300,400;305,0,300,400"};
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

describe("fold feature count consistency", () => {
  it("rejects a reported pane count that disagrees with measured rectangles", () => {
    expect(normalizeFoldTransition({...sample,regionGeometry:"0,0,280,400"},101)).toBe(null);
    expect(normalizeFoldTransition({...sample,hingeCount:3,regionGeometry:"0,0,280,400;285,0,280,400"},101)).toBe(null);
    expect(normalizeFoldTransition({...sample,regionGeometry:"0,0,280,400;285,0,280,400"},101)?.usableRegions).toBe(2);
  });
});


describe("genuine pre-capture fold baseline", () => {
  it("keeps the latest observed geometry with its real owner's lifetime", () => {
    const old=Symbol("old"), active=Symbol("active");
    expect(rememberActiveFoldSnapshot(old, {...sample,regionGeometry:"0,0,280,400;285,0,280,400"},100)).toBe(true);
    expect(getActiveFoldBaseline()?.baseline).toBe(true);
    expect(rememberActiveFoldSnapshot(active, {...sample,revision:2,regionGeometry:"0,0,300,400;305,0,300,400"},200)).toBe(true);
    forgetActiveFoldSnapshot(old);
    expect(getActiveFoldBaseline()?.revision).toBe(2);
    forgetActiveFoldSnapshot(active);
    expect(getActiveFoldBaseline()).toBe(null);
  });
  it("never substitutes an invalid topology or invents a fold during recording", () => {
    const owner=Symbol("test");
    expect(rememberActiveFoldSnapshot(owner, {...sample,regionGeometry:"0,0,300,400;100,0,300,400"},100)).toBe(false);
    expect(getActiveFoldBaseline()).toBe(null);
    expect(rememberActiveFoldSnapshot(owner, {...sample,regionGeometry:"0,0,280,400;285,0,280,400"},100)).toBe(true);
    const baseline=getActiveFoldBaseline()!;
    expect(foldContinuitySummary([baseline])).toContain("0");
    const fold=normalizeFoldTransition({...sample,revision:2,posture:"FLAT",regionGeometry:"0,0,320,400;325,0,320,400"},200)!;
    expect(appendFoldTransition([baseline],fold)).toHaveLength(2);
    forgetActiveFoldSnapshot(owner);
  });
});


describe("stale fold baseline rejection", () => {
  it("retains a newer observation when a delayed native callback arrives", () => {
    const owner=Symbol("fresh");
    expect(rememberActiveFoldSnapshot(owner,{...sample,revision:10,regionGeometry:"0,0,280,400;285,0,280,400"},100)).toBe(true);
    expect(rememberActiveFoldSnapshot(owner,{...sample,revision:9,regionGeometry:"0,0,250,400;255,0,250,400"},101)).toBe(false);
    expect(getActiveFoldBaseline()?.revision).toBe(10);
    expect(foldContinuitySummary([getActiveFoldBaseline()!])).toContain("0");
    forgetActiveFoldSnapshot(owner);
  });
  it("labels missing initial baseline without inventing start geometry", () => {
    const event=normalizeFoldTransition({...sample,revision:2,regionGeometry:"0,0,280,400;285,0,280,400"},100)!;
    expect(foldContinuitySummary([event])).toContain("Начальная геометрия");
  });
});

describe("long fold recording evidence retention", () => {
  it("preserves the actual starting posture through over 120 different observations", () => {
    const start=normalizeFoldTransition({...sample,regionGeometry:"0,0,280,400;285,0,280,400"},100)!;
    let events: FoldTransitionEvidence[]=[{...start,baseline:true as const}];
    for(let i=0;i<150;i++) {
      const update=normalizeFoldTransition({...sample,revision:i+2,
        regionGeometry:`0,0,${280+i},400;${285+i},0,280,400`},101+i)!;
      events=appendFoldTransition(events,update);
    }
    expect(events).toHaveLength(120);
    expect(events[0]?.baseline).toBe(true);
    expect(events[0]?.omittedEarlierEvents).toBe(31);
    expect(foldContinuitySummary(events)).toContain("Зафиксировано изменений геометрии: 150");
    expect(foldContinuitySummary(events)).toContain("Ранние наблюдения сокращены");
  });
});

describe("fold posture versus app-window resize reporting",()=>{
  it("does not call a CSS viewport resize a physical hinge transition",()=>{
    const first=normalizeFoldTransition({...sample,regionGeometry:"0,0,280,400;285,0,280,400"},100)!;
    const baseline={...first,baseline:true as const};
    const resize=normalizeFoldTransition({...sample,revision:2,regionGeometry:"0,0,300,400;305,0,300,400"},101)!;
    const summary=foldContinuitySummary([baseline,resize]);
    expect(summary).toContain("изменений шарниров/положения: 0");
    expect(summary).toContain("только геометрии окна: 1");
  });
  it("counts a genuinely reported hinge posture change separately",()=>{
    const first=normalizeFoldTransition({...sample,regionGeometry:"0,0,280,400;285,0,280,400"},100)!;
    const changed=normalizeFoldTransition({...sample,revision:2,posture:"FLAT",regionGeometry:"0,0,280,400;285,0,280,400"},101)!;
    expect(foldContinuitySummary([{...first,baseline:true},changed]))
      .toContain("изменений шарниров/положения: 1");
  });
});

describe("long recording keeps fold classification counts",()=>{
  it("retains the number of hinge and window-only changes after journal trimming",()=>{
    const start=normalizeFoldTransition({...sample,revision:1,regionGeometry:"0,0,280,400;285,0,280,400"},100)!;
    let events: FoldTransitionEvidence[]=[{...start,baseline:true as const}];
    for(let i=1;i<=140;i++){
      const next=normalizeFoldTransition({...sample,revision:i+1,
        posture:i%2===0?"HALF_OPENED":"FLAT",
        regionGeometry:`0,0,${280+i},400;${285+i},0,280,400`},100+i)!;
      events=appendFoldTransition(events,next);
    }
    expect(events).toHaveLength(120);
    expect(events[0]?.baseline).toBe(true);
    expect(events[0]?.omittedPostureChanges).toBeGreaterThan(0);
    expect(foldContinuitySummary(events)).toContain("изменений шарниров/положения: 140");
    expect(foldContinuitySummary(events)).toContain("только геометрии окна: 1");
  });
});

describe("baseline-preserving fold journal under repeated folding",()=>{
  it("does not discard the first open-close cycle when the bounded journal overflows",()=>{
    const start=normalizeFoldTransition({...sample,revision:1,
      regionGeometry:"0,0,280,400;285,0,280,400"},100)!;
    let events:FoldTransitionEvidence[]=[{...start,baseline:true}];
    for(let index=1;index<=140;index++){
      const posture=index%2?"FLAT":"HALF_OPENED";
      const next=normalizeFoldTransition({...sample,revision:index+1,posture,
        regionGeometry:"0,0,280,400;285,0,280,400"},100+index)!;
      events=appendFoldTransition(events,next);
    }
    const summary=foldContinuitySummary(events);
    expect(summary).toContain("изменений шарниров/положения: 140");
    expect(summary).toContain("только геометрии окна: 0");
    expect(events[0]?.omittedEarlierEvents).toBe(21);
  });
  it("keeps a newer Activity owner when the previous owner delivers a late event",()=>{
    const previous=Symbol("previous"), current=Symbol("current");
    const topology={...sample,regionGeometry:"0,0,280,400;285,0,280,400"};
    expect(rememberActiveFoldSnapshot(previous,{...topology,revision:900},100)).toBe(true);
    expect(rememberActiveFoldSnapshot(current,{...topology,revision:1,posture:"FLAT"},200)).toBe(true);
    expect(rememberActiveFoldSnapshot(previous,{...topology,revision:901},150)).toBe(false);
    expect(getActiveFoldBaseline()?.posture).toBe("FLAT");
    forgetActiveFoldSnapshot(previous);
    expect(getActiveFoldBaseline()?.posture).toBe("FLAT");
    forgetActiveFoldSnapshot(current);
  });
});
