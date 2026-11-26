import {describe,expect,it} from "vitest";
import {highSpeedRecordedModeEvidence} from "./native-video-evidence";
import type {NativeMp4Inspection} from "./native";
const requested={width:1920,height:1080,fps:120};
const base={mime:"video/avc",width:1920,height:1080,samplesRead:33,timestampSpanUs:266666,
 outOfOrderPresentationTimes:0,duplicatePresentationTimes:0,estimatedSampleFps:120,
 tailSamplesRead:33,tailFirstPresentationTimeUs:8_000_000,tailLastPresentationTimeUs:8_266_666,
 tailOutOfOrderPresentationTimes:0,tailDuplicatePresentationTimes:0,tailEstimatedSampleFps:119.8,
 tailSampleNearDeclaredEnd:true} as NativeMp4Inspection;
const evidence=(inspection:NativeMp4Inspection|undefined=base,bytes=100000)=>
 highSpeedRecordedModeEvidence("rear",requested,{bytes,...(inspection?{inspection}:{})},123);
describe("native high speed recording evidence",()=>{
 it("requires clean, sufficiently long beginning and tail samples",()=>{
  const result=evidence();expect(result.state).toBe("recorded");expect(result.file?.width).toBe(1920);
  expect(result.message).toContain("всех кадров");
 });
 it("does not certify mismatched dimensions",()=>{const result=evidence({...base,width:1280});expect(result.state).toBe("unknown");expect(result.message).toContain("отличается");});
 it("keeps missing files unconfirmed",()=>expect(evidence(base,0).state).toBe("unknown"));
 it("keeps a missing end FPS unconfirmed",()=>expect(evidence({...base,tailEstimatedSampleFps:null}).state).toBe("unknown"));
 it("rejects short head or tail windows",()=>{
  for(const item of [{...base,samplesRead:7},{...base,timestampSpanUs:200000},{...base,tailSamplesRead:7},{...base,tailLastPresentationTimeUs:8_100_000}] as NativeMp4Inspection[])expect(evidence(item).state).toBe("unknown");
 });
 it("rejects duplicate or reordered timestamps in either sample window",()=>{
  for(const item of [{...base,duplicatePresentationTimes:1},{...base,outOfOrderPresentationTimes:1},{...base,tailDuplicatePresentationTimes:1},{...base,tailOutOfOrderPresentationTimes:1}] as NativeMp4Inspection[])expect(evidence(item).state).toBe("unknown");
 });
 it("rejects missing end evidence, wrong FPS, swapped dimensions and non-video tracks",()=>{
  for(const item of [{...base,tailSampleNearDeclaredEnd:false},{...base,estimatedSampleFps:60},{...base,width:1080,height:1920},{...base,mime:"application/octet-stream"}] as NativeMp4Inspection[])expect(evidence(item).state).toBe("unknown");
 });
});
