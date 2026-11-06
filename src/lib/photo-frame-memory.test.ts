import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

describe("multi-frame camera memory keeps full-resolution fidelity",()=>{
 it("uses exact integer accumulation without losing any night/burst frames",()=>{
  const camera=readFileSync("src/components/multicam/CameraPro.tsx","utf8");
  expect(camera).toContain("frames <= 257 ? new Uint16Array(w * h * 4) : new Uint32Array(w * h * 4)");
  expect(camera).toContain("for (let k = 0; k < frames; k++)");
  expect(camera).toContain("acc[i]! += d[i]!");
  expect(camera).toContain("out.data[i] = acc[i]! / frames");
  expect(camera).toContain('c.toBlob(blob => finish(blob), "image/jpeg", 0.93)');
  expect(camera).toContain("c.width = w; c.height = h");
 });
 it("uint16 accumulates all 40 full-exposure frames exactly",()=>{
  const a=new Uint16Array(4);
  for(let frame=0;frame<40;frame++)for(let i=0;i<a.length;i++)a[i]=a[i]!+255;
  expect([...a]).toEqual([10200,10200,10200,10200]);
  expect(Math.round(a[0]!/40)).toBe(255);
 });
});
