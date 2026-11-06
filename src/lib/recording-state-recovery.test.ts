import {describe,expect,it} from "vitest";
import {interruptedOnCameraExit,isStaleCapture,STALE_CAPTURE_MESSAGE} from "./recording-state-recovery";
describe("CameraTab state recovery after Activity or tab recreation",()=>{
 it("recognises logically impossible states without treating them as saved",()=>{
  expect(isStaleCapture(false,"recording")).toBe(true);
  expect(isStaleCapture(false,"starting")).toBe(true);
  expect(isStaleCapture(true,"recording")).toBe(false);
  expect(isStaleCapture(false,"saved")).toBe(false);
 });
 it("never trusts a destroyed recorder's late callback as durable save evidence",()=>{
  for(const phase of ["starting","recording","stopping","saving"] as const)
    expect(interruptedOnCameraExit(phase,false)).toBe(true);
  expect(interruptedOnCameraExit("idle",true)).toBe(true);
  expect(interruptedOnCameraExit("idle",false)).toBe(false);
  expect(interruptedOnCameraExit("saved",false)).toBe(false);
  expect(STALE_CAPTURE_MESSAGE).toContain("Проверьте медиатеку");
 });
});
