import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("AI tracking keeps real face focus while avoiding repeated OEM commands",()=>{
 it("retains face detection, normalized points and hybrid centre fallback",()=>{
  const s=readFileSync("src/components/multicam/CameraPro.tsx","utf8");
  expect(s).toContain("const faces = await det.detect(v)");
  expect(s).toContain("Math.hypot(center.x-lastFocusPoint.x");
  expect(s).toContain("performance.now()-lastFocusSubmitted > 1500");
  expect(s).toContain("if (poi && !focusBusy");
  expect(s).toContain('pointsOfInterest: [center]');
  expect(s).toContain('pointsOfInterest: [{ x: 0.5, y: 0.5 }]');
  expect(s).toContain("if (!alive || (document.hidden && !responsiveHiddenFrames)) return;");
 });
});
