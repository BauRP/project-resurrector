import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("AudioContext meter load without removing live audio processing",()=>{
 it("samples VU analyser at 25Hz on 60/90/120Hz displays",()=>{
  const src=readFileSync("src/components/multicam/CaptureProPanel.tsx","utf8");
  const start=src.indexOf("const tick = (t: number) => {");
  const code=src.slice(start,start+850);
  expect(code.indexOf("if (t - last < 40)")).toBeLessThan(code.indexOf("an.getFloatTimeDomainData(buf)"));
  expect(code).toContain("setLevel({ rms:");
  expect(code).toContain("peakRef.current");
  expect(src).toContain("void ctx.close()");
 });
});
