import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("QR switch only cancels incomplete ICE/SDP; retains connected cameras",()=>{
 it("closes pending offers and answers, with generation invalidation",()=>{
  const mesh=readFileSync("src/lib/mesh.ts","utf8");
  const start=mesh.indexOf("cancelPairing() {");
  const end=mesh.indexOf("  leave() {",start);
  expect(start).toBeGreaterThan(0);
  const body=mesh.slice(start,end);
  expect(body).toContain("this.generation++");
  expect(body).toContain("this.answerEpoch++");
  expect(body).toContain("this.pending = null");
  expect(body).toContain("this.pendingAnswer = null");
  expect(body).not.toContain("this.channels.forEach");
 });
 it("cancels on role switch and modal unmount",()=>{
  const modal=readFileSync("src/components/multicam/ConnectModal.tsx","utf8");
  expect(modal.split("mesh.cancelPairing()").length-1).toBe(2);
 });
});
