import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { FoldScrollRestorer, flushFoldScrollWrites, readFoldScrollTop, saveFoldScrollTop } from "./fold-scroll-position";

const values = new Map<string,string>();
beforeEach(() => {
  flushFoldScrollWrites();
  values.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key:string) => values.get(key) ?? null,
    setItem: (key:string, value:string) => { values.set(key,value); },
  });
});
afterEach(() => { flushFoldScrollWrites(); vi.unstubAllGlobals(); });
const port=(top=0,height=1000,viewport=250) =>
  ({scrollTop:top,scrollHeight:height,clientHeight:viewport});

describe("fold/editor vertical scroll restoration", () => {
  it("never writes localStorage synchronously during scroll or tab navigation", () => {
    const writes = vi.spyOn(localStorage, "setItem");
    const el = port(0, 1800, 300);
    const restorer = new FoldScrollRestorer();
    restorer.activate("editor", el);
    restorer.enter("editor", el);
    el.scrollTop = 520;
    restorer.onScroll("editor", el);
    restorer.capture(el);
    restorer.pauseForTransition();
    restorer.activate("settings", el);
    expect(writes).not.toHaveBeenCalled();
    expect(readFoldScrollTop("editor")).toBe(520);
    flushFoldScrollWrites();
    expect(writes).toHaveBeenCalledWith("multicam-fold-scroll-v1:editor", "520");
    writes.mockRestore();
  });
  it("preserves distinct editor and settings positions across tab transitions", () => {
    const port1=port(0,1000,250), restorer=new FoldScrollRestorer();
    restorer.activate("editor",port1);
    restorer.enter("editor",port1);
    port1.scrollTop=480;
    restorer.onScroll("editor",port1);
    expect(readFoldScrollTop("editor")).toBe(480);
    restorer.capture(port1);
    restorer.activate("settings",port1);
    restorer.enter("settings",port1);
    port1.scrollTop=160;
    restorer.onScroll("settings",port1);
    expect(readFoldScrollTop("settings")).toBe(160);
    restorer.capture(port1);
    restorer.activate("editor",port1);
    restorer.enter("editor",port1);
    expect(port1.scrollTop).toBe(480);
    expect(readFoldScrollTop("settings")).toBe(160);
  });
  it("waits for media library content rather than overwriting a restored position with zero", () => {
    expect(saveFoldScrollTop("editor",930)).toBe(true);
    const element=port(0,200,200);
    const restorer=new FoldScrollRestorer();
    restorer.activate("editor",element);
    restorer.enter("editor",element);
    expect(element.scrollTop).toBe(0);
    expect(restorer.pending("editor")).toBe(true);
    restorer.onScroll("editor",element);
    expect(readFoldScrollTop("editor")).toBe(930);
    element.scrollHeight=1800;
    restorer.retry("editor",element);
    expect(element.scrollTop).toBe(930);
    expect(restorer.pending("editor")).toBe(false);
    restorer.onScroll("editor",element);
    expect(readFoldScrollTop("editor")).toBe(930);
  });
  it("does not overwrite old editor scroll when tab exit animation briefly resets the container", () => {
    const el=port(0,1200,300);
    const restorer=new FoldScrollRestorer();
    restorer.activate("editor",el);
    restorer.enter("editor",el);
    el.scrollTop=735;
    restorer.onScroll("editor",el);
    restorer.capture(el);
    restorer.pauseForTransition();
    el.scrollTop=0; // DOM now contains the incoming settings tab
    restorer.onScroll("editor",el);
    expect(readFoldScrollTop("editor")).toBe(735);
    restorer.activate("settings",el);
    restorer.enter("settings",el);
    expect(readFoldScrollTop("editor")).toBe(735);
  });
  it("clamps to available scroll while waiting and user input cancels delayed restoration", () => {
    saveFoldScrollTop("editor",1500);
    const el=port(0,700,200);
    const restorer=new FoldScrollRestorer();
    restorer.activate("editor",el);
    restorer.enter("editor",el);
    expect(el.scrollTop).toBe(500);
    expect(restorer.pending("editor")).toBe(true);
    el.scrollTop=25;
    restorer.onScroll("editor",el);
    expect(restorer.pending("editor")).toBe(false);
    expect(readFoldScrollTop("editor")).toBe(25);
    el.scrollHeight=2500;
    restorer.retry("editor",el);
    expect(el.scrollTop).toBe(25);
  });
  it("preserves the editor position when fold reflow temporarily collapses scroll height", () => {
    const el=port(0,1800,300);
    const restorer=new FoldScrollRestorer();
    restorer.activate("editor",el);
    restorer.enter("editor",el);
    el.scrollTop=890;
    restorer.onScroll("editor",el);
    expect(readFoldScrollTop("editor")).toBe(890);
    el.scrollHeight=300;
    el.scrollTop=0; // Browser auto-clamps after a fold layout collapse.
    restorer.onViewportReflow("editor",el);
    expect(restorer.pending("editor")).toBe(true);
    restorer.onScroll("editor",el);
    expect(readFoldScrollTop("editor")).toBe(890);
    el.scrollHeight=1900;
    restorer.onViewportReflow("editor",el);
    expect(el.scrollTop).toBe(890);
    expect(restorer.pending("editor")).toBe(false);
  });
  it("detects an auto-clamped scroll event even before ResizeObserver fires", () => {
    const el=port(0,1500,300),restorer=new FoldScrollRestorer();
    restorer.activate("settings",el);
    restorer.enter("settings",el);
    el.scrollTop=650;
    restorer.onScroll("settings",el);
    el.scrollHeight=300;
    el.scrollTop=0;
    restorer.onScroll("settings",el);
    expect(readFoldScrollTop("settings")).toBe(650);
    expect(restorer.pending("settings")).toBe(true);
    el.scrollHeight=2000;
    restorer.onViewportReflow("settings",el);
    expect(el.scrollTop).toBe(650);
  });
  it("coalesces rapid scroll writes while retaining the final position on navigation", () => {
    const writes = vi.spyOn(localStorage, "setItem");
    const element = port(0,20000,400);
    const restorer = new FoldScrollRestorer();
    restorer.activate("settings",element);
    restorer.enter("settings",element);
    for(let i=1;i<=400;i++) {
      element.scrollTop=i;
      restorer.onScroll("settings",element);
    }
    expect(writes.mock.calls.length).toBeLessThan(12);
    restorer.capture(element);
    expect(readFoldScrollTop("settings")).toBe(400);
    restorer.pauseForTransition();
    restorer.activate("camera",element);
    expect(writes.mock.calls.length).toBeLessThan(15);
    writes.mockRestore();
  });
  it("refuses corrupted, oversized, impossible, and camera-only scroll state", () => {
    expect(saveFoldScrollTop("camera",200)).toBe(false);
    expect(saveFoldScrollTop("editor",-1)).toBe(false);
    expect(saveFoldScrollTop("editor",Number.NaN)).toBe(false);
    expect(saveFoldScrollTop("settings",11_000_000)).toBe(false);
    values.set("multicam-fold-scroll-v1:editor","Infinity");
    expect(readFoldScrollTop("editor")).toBeNull();
    values.set("multicam-fold-scroll-v1:editor","9".repeat(300));
    expect(readFoldScrollTop("editor")).toBeNull();
    values.set("multicam-fold-scroll-v1:editor","250.75");
    expect(readFoldScrollTop("editor")).toBe(250.75);
  });
  it("is wired into actual tab navigation and observes changing panel height", () => {
    const code=readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
    expect(code).toContain("scrollRestorer.current.onScroll(tab, event.currentTarget)");
    expect(code).toContain("restorer.activate(tab, port)");
    expect(code).toContain("restorer.enter(tab, port)");
    expect(code).toContain("captureTabScroll();");
    expect(code).toContain("observer.observe(port)");
    expect(code).toContain('window.addEventListener("pagehide", onPageHide)');
  });
});
