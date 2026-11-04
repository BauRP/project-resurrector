import {describe, expect, it, vi} from "vitest";
import {PointerGestureRegistry} from "./pointer-gesture-registry";
import {readFileSync} from "node:fs";

describe("editor gestures survive pointer cancel and tab exit", () => {
  it("cleans a lost pointerup on pointercancel without applying a drag", () => {
    const registry=new PointerGestureRegistry();
    const moved=vi.fn(), completed=vi.fn();
    registry.register(moved,completed);
    window.dispatchEvent(new Event("pointermove"));
    expect(moved).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("pointercancel"));
    window.dispatchEvent(new Event("pointerup"));
    window.dispatchEvent(new Event("pointermove"));
    expect(completed).not.toHaveBeenCalled();
    expect(moved).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
  });
  it("cleans every active gesture on editor unmount without altering its tools", () => {
    const registry=new PointerGestureRegistry();
    const up=vi.fn(), move=vi.fn();
    for(let i=0;i<30;i++)registry.register(move,up);
    expect(registry.size).toBe(30);
    registry.dispose();
    registry.dispose();
    expect(registry.size).toBe(0);
    window.dispatchEvent(new Event("pointerup"));
    expect(up).not.toHaveBeenCalled();
  });
  it("commits normal pointerup only once", () => {
    const registry=new PointerGestureRegistry();
    const up=vi.fn();
    registry.register(()=>undefined,up);
    window.dispatchEvent(new Event("pointerup"));
    window.dispatchEvent(new Event("pointerup"));
    expect(up).toHaveBeenCalledOnce();
    expect(registry.size).toBe(0);
  });
  it("preserves five drag interaction modes in editor", () => {
    const source=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
    expect(source.match(/dragRegistry.current\?\.register\(move, up\)/g)).toHaveLength(5);
    for(const marker of ["startTrDrag","dragOverlay","dragItem","cropDrag","scrub"])expect(source).toContain(marker);
  });
});
