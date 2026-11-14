import {describe,expect,it,vi} from "vitest";
import {readFileSync} from "node:fs";
import {MIN_EXPORT_FRAME_GAP_MS,shouldPaintExportFrame,makeExportProgressReporter} from "./editor-export-pacing";

describe("professional 30fps output pacing on 30-120Hz Android WebViews",()=>{
 it("eliminates duplicate 60-120Hz canvas work while preserving about 30fps",()=>{
   expect(MIN_EXPORT_FRAME_GAP_MS).toBe(26);
   const accepted:number[]=[];
   let last=Number.NEGATIVE_INFINITY;
   for(let time=0;time<1000;time+=1000/120){
     if(shouldPaintExportFrame(time,last)){accepted.push(time);last=time;}
   }
   expect(accepted.length).toBeGreaterThanOrEqual(29);
   expect(accepted.length).toBeLessThanOrEqual(32);
 });
 it("keeps every approximately 30Hz frame, even when delivery is jittery",()=>{
   expect(shouldPaintExportFrame(31.5,0)).toBe(true);
   expect(shouldPaintExportFrame(33.3,0)).toBe(true);
   expect(shouldPaintExportFrame(20,0)).toBe(false);
   expect(shouldPaintExportFrame(0,300)).toBe(true);
 });
 it("does not notify the UI repeatedly for the same displayed percent",()=>{
   const callback=vi.fn();
   const progress=makeExportProgressReporter(callback);
   for(let i=0;i<60;i++)progress(20+i/100);
   expect(callback).toHaveBeenCalledTimes(1);
   expect(callback).toHaveBeenCalledWith(20);
   progress(21.2);progress(21.9);progress(100);
   expect(callback.mock.calls.map(c=>c[0])).toEqual([20,21,100]);
 });
 it("retains real source audio, original 30fps encoder and completion before pacing",()=>{
   const seq=readFileSync("src/lib/editor-sequential-render.ts","utf8");
   const simple=readFileSync("src/lib/editor-webm-render.ts","utf8");
   for(const code of [seq,simple]){
     expect(code).toContain("shouldPaintExportFrame(nowMs,lastPaintMs)");
     expect(code).toContain("makeExportProgressReporter(");
     expect(code).toContain("canvas.captureStream(30)");
     expect(code).toContain("new AudioContext()");
     expect(code).toContain("progressOnce(100)");
   }
   expect(seq.indexOf("if(position>=part.timelineEnd")).toBeLessThan(seq.indexOf("if(!shouldPaintExportFrame"));
   expect(simple.indexOf("if(at>=plan.segment.out")).toBeLessThan(simple.indexOf("if(!shouldPaintExportFrame"));
   expect(seq).toContain("lastPaintMs=Number.NEGATIVE_INFINITY;\n          await loadPart(partIndex)");
 });
});
