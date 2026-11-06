import {describe,expect,it} from "vitest";
import {planSequentialVideoRender} from "./editor-sequential-render";
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