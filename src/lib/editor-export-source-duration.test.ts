import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {canExportSegmentThrough,reachedExportTrimEnd} from "./editor-export-source-duration";
describe("Android WebView Infinity-duration WebM and natural end event",()=>{
 it("uses actual reported time first then finite original capture metadata",()=>{
   expect(canExportSegmentThrough(20,15,20)).toBe(true);
   expect(canExportSegmentThrough(Infinity,15,14.9)).toBe(true);
   expect(canExportSegmentThrough(Infinity,1800,1800)).toBe(true);
   expect(canExportSegmentThrough(Infinity,3600,3599.9)).toBe(true);
   expect(canExportSegmentThrough(Infinity,7200,7200)).toBe(true);
   expect(canExportSegmentThrough(14,15,14.5)).toBe(false);
 });
 it("never guesses clip duration when source metadata is absent or invalid",()=>{
   for(const invalid of [undefined,NaN,0,-1,Infinity,86401]){
     expect(canExportSegmentThrough(Infinity,invalid,15)).toBe(false);
   }
   expect(canExportSegmentThrough(10,15,12)).toBe(false);
   expect(canExportSegmentThrough(15,15,30)).toBe(false);
   expect(canExportSegmentThrough(15,15,NaN)).toBe(false);
 });
 it("finishes a normal end-of-file near the trimmed boundary without false errors",()=>{
   expect(reachedExportTrimEnd(14.99,15)).toBe(true);
   expect(reachedExportTrimEnd(14.9,15)).toBe(true);
   expect(reachedExportTrimEnd(14.0,15)).toBe(false);
   expect(reachedExportTrimEnd(7199.9,7200)).toBe(true);
   expect(reachedExportTrimEnd(Infinity,15)).toBe(false);
   const a=readFileSync("src/lib/editor-webm-render.ts","utf8");
   const b=readFileSync("src/lib/editor-sequential-render.ts","utf8");
   expect(a).toContain("reachedExportTrimEnd(video.currentTime,plan.segment.out)");
   expect(b).toContain("reachedExportTrimEnd(video.currentTime,current.segment.out)");
   expect(b).toContain("finishCurrentPart();");
   expect(b).toContain("if(switching||completed||stopped)return");
 });
});
