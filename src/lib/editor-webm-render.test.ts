import {describe,expect,it} from "vitest";
import {planSimpleVideoRender,webmOutputSize} from "./editor-webm-render";
const base={kind:"video" as const,mediaId:"clip",start:0,in:2,out:9,speed:1,reverse:false,opacity:100,scale:100,posX:0,look:"Без цвета"};
describe("real offline one-clip render planning",()=>{
 it("accepts a trimmed video with actual duration",()=>{
  expect(planSimpleVideoRender([base],[],0,false,false).duration).toBe(7);
 });
 it("rejects multi-track, hidden/muted and backwards recording rather than drop changes",()=>{
  expect(()=>planSimpleVideoRender([base,base],[],0,false,false)).toThrow();
  expect(()=>planSimpleVideoRender([base],[],1,false,false)).toThrow();
  expect(()=>planSimpleVideoRender([base],[],0,true,false)).toThrow();
  expect(()=>planSimpleVideoRender([{...base,reverse:true}],[],0,false,false)).toThrow();
 });
 it("rejects out-of-bounds crop and unlimited render workloads",()=>{
  expect(()=>planSimpleVideoRender([{...base,crop:{x:70,y:0,w:60,h:100}}],[],0,false,false)).toThrow();
  expect(()=>planSimpleVideoRender([{...base,out:1000}],[],0,false,false)).toThrow();
 });
});
describe("output settings must match actual WebM canvas and encoder",()=>{
 const config={videoCodec:"VP8",audioCodec:"Opus",resolution:"720p",fps:"30",aspect:"16:9",bitrate:4};
 it("uses real canvas pixels for selected aspect",()=>{
  expect(webmOutputSize(config)).toEqual({width:1280,height:720,bitrate:4000000});
  expect(webmOutputSize({...config,aspect:"9:16"})).toMatchObject({width:720,height:1280});
 });
 it("rejects unsupported settings rather than silently ignoring them",()=>{
  expect(()=>webmOutputSize({...config,videoCodec:"H.264"})).toThrow();
  expect(()=>webmOutputSize({...config,bitrate:50})).toThrow();
 });
});
