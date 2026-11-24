import {describe,expect,it,vi} from "vitest";
import {startDisplayAdaptation} from "./display-topology";

/** Real DOM update in the shared display adapter, not just a pure
 * width-classification test or a string search through tablet CSS.
 * Does not create an Android camera session or a second resize observer.
 */
describe("tablet portrait / landscape / split-window adapter integration",()=>{
 it("switches out of tablet controls on keyboard-only VisualViewport resize",()=>{
  const originalW=Object.getOwnPropertyDescriptor(window,"innerWidth");
  const originalH=Object.getOwnPropertyDescriptor(window,"innerHeight");
  const originalViewport=Object.getOwnPropertyDescriptor(window,"visualViewport");
  const handlers=new Map<string,EventListener>();
  const viewport={
    height:1200,width:800,offsetLeft:0,offsetTop:0,
    addEventListener(type:string,listener:EventListenerOrEventListenerObject){
      if(typeof listener==="function")handlers.set(type,listener);
    },
    removeEventListener(type:string){handlers.delete(type);},
  };
  const queued:FrameRequestCallback[]=[];
  const raf=vi.spyOn(window,"requestAnimationFrame").mockImplementation(fn=>{
    queued.push(fn);return queued.length;
  });
  const cancel=vi.spyOn(window,"cancelAnimationFrame").mockImplementation(()=>undefined);
  let dispose:(()=>void)|undefined;
  const flush=()=>{
    expect(queued.length).toBeGreaterThan(0);
    queued.shift()!(0);
  };
  try{
    Object.defineProperty(window,"innerWidth",{value:800,configurable:true});
    Object.defineProperty(window,"innerHeight",{value:1200,configurable:true});
    Object.defineProperty(window,"visualViewport",{value:viewport,configurable:true});
    dispose=startDisplayAdaptation();
    expect(document.documentElement.dataset["tabletLayout"]).toBe("portrait");
    viewport.height=650;
    handlers.get("resize")!(new Event("resize"));
    flush();
    expect(document.documentElement.dataset["tabletLayout"]).toBe("none");
    viewport.height=1200;
    handlers.get("resize")!(new Event("resize"));
    flush();
    expect(document.documentElement.dataset["tabletLayout"]).toBe("portrait");
    dispose();dispose=undefined;
    expect(handlers.size).toBe(0);
  }finally{
    dispose?.();
    if(originalW)Object.defineProperty(window,"innerWidth",originalW);
    if(originalH)Object.defineProperty(window,"innerHeight",originalH);
    if(originalViewport)Object.defineProperty(window,"visualViewport",originalViewport);
    else Reflect.deleteProperty(window,"visualViewport");
    raf.mockRestore();cancel.mockRestore();
  }
 });
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
    rotate(800,800);
    expect(document.documentElement.dataset["tabletLayout"]).toBe("portrait");
    rotate(831,800);
    expect(document.documentElement.dataset["tabletLayout"]).toBe("portrait");
    rotate(864,800);
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
