import { describe,expect,it } from "vitest";
import { isFreshNativeFrame } from "./native-preview-freshness";

describe("native Camera2 preview frame freshness",()=>{
  it("does not repeatedly decode the same JPEG in a compact fold window",()=>{
    const frame={jpeg:"base64-frame",frameAt:500};
    expect(isFreshNativeFrame(frame,0)).toBe(true);
    expect(isFreshNativeFrame(frame,500)).toBe(false);
    expect(isFreshNativeFrame({...frame,frameAt:750},500)).toBe(true);
  });
  it("rejects empty frames after camera stop or a hidden window",()=>{
    expect(isFreshNativeFrame({jpeg:"",frameAt:100},0)).toBe(false);
  });
  it("accepts legacy bridge frames without timestamps",()=>{
    expect(isFreshNativeFrame({jpeg:"old-android-preview"},100)).toBe(true);
  });
  it("fails open when an OEM provides an invalid frame timestamp",()=>{
    expect(isFreshNativeFrame({jpeg:"frame",frameAt:NaN},100)).toBe(true);
  });
});
