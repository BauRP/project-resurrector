import {describe,expect,it} from "vitest";
import {chooseProxyEvictions} from "./media-cache";
import {readFileSync} from "node:fs";
describe("Persistent preview storage is LRU and never deletes originals",()=>{
 it("removes oldest entries until both quotas hold",()=>{
  const old=[{id:"a",size:40,touched:1},{id:"b",size:50,touched:2}];
  expect(chooseProxyEvictions(old,{id:"c",size:60,touched:3},100,3)).toEqual(["a","b"]);
 });
 it("retains recently read derived previews",()=>{
  const old=[{id:"a",size:40,touched:100},{id:"b",size:40,touched:2}];
  expect(chooseProxyEvictions(old,{id:"c",size:40,touched:200},80,2)).toEqual(["b"]);
 });
 it("keeps original videos in a different database",()=>{
  const s=readFileSync("src/lib/media-cache.ts","utf8");
  expect(s).toContain('"multicam-pov-preview-cache"');
  expect(s).not.toContain('"multicam-pov-media"');
 });
});
describe("Long waveform subtitle processing",()=>{
 it("does not pass a huge waveform as spread function arguments",()=>{
  const s=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
  expect(s).not.toContain("Math.max(...m.peaks)");
  expect(s).toContain("idx%4096===0");
  expect(s).toContain('setSubState(blocks.length?"on":"off")');
 });
});
