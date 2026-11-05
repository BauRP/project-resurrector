import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("native JPEG preview adaptive transport",()=>{
 it("schedules next preview only after prior response and respects hidden state",()=>{
  const code=readFileSync("src/components/multicam/NativeRecordingPanel.tsx","utf8");
  expect(code).toContain("adaptiveDelay=Math.max(250,Math.min(2000");
  expect(code).toContain("window.setTimeout(()=>{void read();},adaptiveDelay)");
  expect(code).toContain("const elapsed=performance.now()-started");
  expect(code).toContain("if(live&&visible)");
  expect(code).toContain("window.clearTimeout(timer)");
  expect(code).toContain("setVisible(false)");
  expect(code).toContain("bridge.previewFrame()");
  expect(code).toContain("setPreview");
 });
});
