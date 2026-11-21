import {describe,expect,it,vi} from "vitest";
import {startDisplayAdaptation} from "./display-topology";

/** Real DOM update in the shared display adapter, not just a pure
 * width-classification test or a string search through tablet CSS.
 * Does not create an Android camera session or a second resize observer.
 */
describe("tablet portrait / landscape / split-window adapter integration",()=>{
 it("switches the same mounted screen on rotation and releases styles on cleanup",()=>{
  const originalWidth=Object.getOwnPropertyDescriptor(window,"innerWidth");
  const originalHeight=Object.getOwnPropertyDescriptor(window,"innerHeight");
  const pending: FrameRequestCallback[]=[];
  const raf=vi.spyOn(window,"requestAnimationFrame").mockImplementation(callback=>{
    pending.push(callback);
    return pending.length;
  });
  const cancel=vi.spyOn(window,"cancelAnimationFrame").mockImplementation(()=>undefined);
  let dispose: (()=>void)|undefined;
  const setWindow=(width:number,height:number)=>{
    Object.defineProperty(window,"innerWidth",{value:width,configurable:true});
    Object.defineProperty(window,"innerHeight",{value:height,configurable:true});
  };
  const rotate=(width:number,height:number)=>{
    setWindow(width,height);
    window.dispatchEvent(new Event("resize"));
    const next=pending.shift();
    expect(next).toBeDefined();
    next!(0);
  };
  try {
    setWindow(600,800);
    dispose=startDisplayAdaptation();
    expect(document.documentElement.dataset["tabletLayout"]).toBe("portrait");
    expect(document.documentElement.dataset["foldCount"]).toBeUndefined();
    rotate(800,600);
    expect(document.documentElement.dataset["tabletLayout"]).toBe("landscape");
    rotate(1280,800);
    expect(document.documentElement.dataset["tabletLayout"]).toBe("landscape");
    rotate(800,1280);
    expect(document.documentElement.dataset["tabletLayout"]).toBe("portrait");
    // Android resized to a split-screen 450px pane: no fake tablet rail.
    rotate(450,800);
    expect(document.documentElement.dataset["tabletLayout"]).toBe("none");
    rotate(800,600);
    expect(document.documentElement.dataset["tabletLayout"]).toBe("landscape");
    dispose();dispose=undefined;
    expect(document.documentElement.dataset["tabletLayout"]).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("");
  } finally {
    dispose?.();
    if(originalWidth)Object.defineProperty(window,"innerWidth",originalWidth);
    if(originalHeight)Object.defineProperty(window,"innerHeight",originalHeight);
    raf.mockRestore();
    cancel.mockRestore();
  }
 });
});
