import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {planSequentialVideoRender, loadSequentialSource} from "./editor-sequential-render";
const one={kind:"video" as const,mediaId:"a",track:1,start:0,in:0,out:3,
 speed:1,reverse:false,opacity:100,scale:100,posX:0,look:"Без цвета"};
const two={...one,mediaId:"b",start:3,in:1,out:5};
describe("sequential local WebM rendering",()=>{
 it("makes a real contiguous hard-cut plan for clips on one lane",()=>{
  const plan=planSequentialVideoRender([two,one],[],0,{},{}); 
  expect(plan.parts.map(p=>[p.segment.mediaId,p.timelineStart,p.timelineEnd]))
    .toEqual([["a",0,3],["b",3,7]]);
  expect(plan.duration).toBe(7);
 });
 it("rejects gaps, overlapping clips, multiple lanes and transitions",()=>{
  expect(()=>planSequentialVideoRender([one,{...two,start:4}],[],0,{},{})).toThrow();
  expect(()=>planSequentialVideoRender([one,{...two,start:2}],[],0,{},{})).toThrow();
  expect(()=>planSequentialVideoRender([one,{...two,track:2}],[],0,{},{})).toThrow();
  expect(()=>planSequentialVideoRender([one,two],[],1,{},{})).toThrow();
 });
 it("rejects edits that would silently disappear and excessive workload",()=>{
  expect(()=>planSequentialVideoRender([one,{...two,look:"Кино"}],[],0,{},{})).toThrow();
  expect(()=>planSequentialVideoRender([one,two],[],0,{v1:true},{})).toThrow();
  expect(()=>planSequentialVideoRender([one,{...two,out:180}],[],0,{},{})).toThrow();
 });
});
describe("sequential export opens only the current original, not all video Blobs",()=>{
 const valid=()=>new Blob(["x".repeat(1400)],{type:"video/webm"});
 it("requests one source at a time and supports previous Blob[] callers",async()=>{
   const controller=new AbortController();
   const fetched:number[]=[];
   const source=async(index:number)=>{fetched.push(index);return valid();};
   const first=await loadSequentialSource(source,0,3,controller.signal);
   expect(first.size).toBeGreaterThan(1024);
   expect(fetched).toEqual([0]);
   await loadSequentialSource(source,1,3,controller.signal);
   expect(fetched).toEqual([0,1]);
   expect(await loadSequentialSource([valid(),valid()],1,2,controller.signal)).toBeInstanceOf(Blob);
 });
 it("refuses missing video, invalid positions and cancelled work",async()=>{
   const ctrl=new AbortController();
   await expect(loadSequentialSource([valid()],1,1,ctrl.signal)).rejects.toThrow();
   await expect(loadSequentialSource([new Blob(["hi"],{type:"video/webm"})],0,1,ctrl.signal)).rejects.toThrow();
   await expect(loadSequentialSource([new Blob(["x".repeat(1500)],{type:"text/plain"})],0,1,ctrl.signal)).rejects.toThrow();
   ctrl.abort();
   const loader=async()=>{throw Error("must not read after cancel");};
   await expect(loadSequentialSource(loader,0,1,ctrl.signal)).rejects.toThrow("отменён");
 });
 it("preserves original video/audio and releases the previous clip URL",()=>{
   const code=readFileSync("src/lib/editor-sequential-render.ts","utf8");
   const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
   expect(editor).toContain("renderSequentialVideoWebm(plan,async index=>");
   expect(editor).not.toContain("Promise.all(plan.parts.map(part=>readPersistedClip");
   expect(code).toContain("if(previousUrl)URL.revokeObjectURL(previousUrl)");
   expect(code).toContain("if(currentUrl)URL.revokeObjectURL(currentUrl)");
   expect(code).toContain("audioSource.connect(audioDest)");
   expect(code).toContain("recorder.start(1000)");
 });
});
