import { describe, expect, it, vi } from "vitest";
import { timelineAnchorFromScroll, scrollForTimelineAnchor, saveTimelineAnchor, readTimelineAnchor } from "./editor-timeline-anchor";

describe("timeline scroll restoration across fold and orientation", () => {
  it("restores the same content time after a zoom or viewport change", () => {
    const anchor=timelineAnchorFromScroll(1200,20);
    expect(anchor).toBe(60);
    expect(scrollForTimelineAnchor(anchor,10,300,2000)).toBe(600);
    expect(scrollForTimelineAnchor(anchor,20,400,1000)).toBe(600);
  });
  it("clamps a previously visible section when the new viewport is shorter or wider", () => {
    expect(scrollForTimelineAnchor(80,20,600,900)).toBe(300);
    expect(scrollForTimelineAnchor(80,20,1200,900)).toBe(0);
  });
  it("does not persist NaN, negative offsets, invalid zoom or corrupted storage", () => {
    expect(timelineAnchorFromScroll(Number.NaN,5)).toBeNull();
    expect(timelineAnchorFromScroll(50,0)).toBeNull();
    expect(scrollForTimelineAnchor(15,Number.NaN,200,500)).toBe(0);
    const values=new Map<string,string>();
    vi.stubGlobal("localStorage",{
      getItem:(k:string)=>values.get(k)??null,
      setItem:(k:string,v:string)=>{values.set(k,v);},
    });
    try {
      expect(saveTimelineAnchor(780,13)).toBe(true);
      expect(readTimelineAnchor()).toBe(60);
      expect(saveTimelineAnchor(-1,13)).toBe(false);
      values.set("multicam-editor-timeline-anchor-v1","Infinity");
      expect(readTimelineAnchor()).toBeNull();
    } finally { vi.unstubAllGlobals(); }
  });
});
