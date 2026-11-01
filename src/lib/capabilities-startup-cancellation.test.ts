import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
// This source contract protects a timeout/cancellation guarantee; a complete
// device getUserMedia cancellation scenario still needs Android instrumentation.
const code=readFileSync("src/lib/capabilities.ts","utf8");
describe("startup camera probe cancellation and stale response safety",()=>{
 it("never launches fresh permission or per-lens discovery after cancellation",()=>{
  expect(code).toContain("if(!signal?.aborted){");
  expect(code).toContain('const rear = !signal?.aborted && permissions.camera === "granted"');
  expect(code).toContain('const front = !signal?.aborted && permissions.camera === "granted"');
  expect(code).toContain("if (isNative() && !signal?.aborted)");
 });
 it("publishes only before a timed-out or unmounted startup is cancelled",()=>{
  expect(code).toContain("const controller=new AbortController()");
  expect(code).toContain('externalSignal?.addEventListener("abort",onExternalAbort,{once:true})');
  expect(code).toContain("controller.abort();");
  expect(code).toContain("if(signal?.aborted)return emptyCapabilityMatrix");
  expect(code).toContain("if(!signal?.aborted)onStage(index,percent)");
  const probe=code.slice(code.indexOf("export async function probeDevice("),
    code.indexOf("export async function probeDeviceSafe("));
  expect(probe.indexOf("if(signal?.aborted)return emptyCapabilityMatrix",probe.indexOf("const matrix: CapabilityMatrix"))).toBeGreaterThan(-1);
  expect(probe.indexOf("if(signal?.aborted)return emptyCapabilityMatrix",probe.indexOf("const matrix: CapabilityMatrix")))
    .toBeLessThan(probe.indexOf("window.localStorage.setItem(KEY, JSON.stringify(matrix))"));
 });
});
