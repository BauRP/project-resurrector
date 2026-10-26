import {describe,expect,it} from "vitest";
import {canExportOriginalClip} from "./editor-original-export";
const conf={aspect:"16:9",fps:"30",resolution:"1080p",videoCodec:"H.264",audioCodec:"AAC",bitrate:16};
const clip={kind:"video" as const,track:1,start:0,in:0,out:10,speed:1,reverse:false,look:"Без цвета",opacity:100,scale:100,posX:0,mediaId:"clip"};
describe("truthful original video export",()=>{
 it("permits only an untouched complete single video",()=>expect(canExportOriginalClip([clip],0,0,10,conf)).toEqual({allowed:true}));
 it("rejects edited timelines rather than delivering an unrelated video",()=>{
  for(const entry of [{...clip,in:1},{...clip,reverse:true},{...clip,look:"Тёплый"},{...clip,speed:2}])
   expect(canExportOriginalClip([entry],0,0,10,conf).allowed).toBe(false);
  expect(canExportOriginalClip([clip,clip],0,0,10,conf).allowed).toBe(false);
  expect(canExportOriginalClip([clip],1,0,10,conf).allowed).toBe(false);
  expect(canExportOriginalClip([clip],0,1,10,conf).allowed).toBe(false);
  expect(canExportOriginalClip([{...clip,crop:{x:0,y:0,w:100,h:100}}],0,0,10,conf).allowed).toBe(false);
  expect(canExportOriginalClip([clip],0,0,10,conf,{muted:true}).allowed).toBe(false);
 });
});
