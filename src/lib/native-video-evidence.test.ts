import { describe, expect, it } from "vitest";
import { highSpeedRecordedModeEvidence } from "./native-video-evidence";
import type { NativeMp4Inspection } from "./native";
const requested={width:1920,height:1080,fps:120};
const base={mime:"video/avc",width:1920,height:1080,estimatedSampleFps:120,
  tailEstimatedSampleFps:119.8,tailSampleNearDeclaredEnd:true} as NativeMp4Inspection;
describe("native high speed recording evidence",()=>{
 it("never calls a bounded MP4 sample scan full verification",()=>{
   const evidence=highSpeedRecordedModeEvidence("0",requested,{bytes:100000,inspection:base},123);
   expect(evidence.state).toBe("recorded");
   expect(evidence.file?.width).toBe(1920);
   expect(evidence.message).toContain("всех кадров");
 });
 it("does not silently certify a mismatched sensor output",()=>{
   const result=highSpeedRecordedModeEvidence("0",requested,{bytes:100000,inspection:{...base,width:1280}},123);
   expect(result.state).toBe("recorded");
   expect(result.message).toContain("отличается");
 });
 it("preserves an unknown state when no file exists",()=>{
   expect(highSpeedRecordedModeEvidence("0",requested,{bytes:0},123).state).toBe("unknown");
 });
 it("keeps missing output FPS explicitly unconfirmed",()=>{
   const result=highSpeedRecordedModeEvidence("0",requested,{bytes:100000,inspection:{...base,tailEstimatedSampleFps:null}},123);
   expect(result.message).toContain("не подтверждены");
 });
});