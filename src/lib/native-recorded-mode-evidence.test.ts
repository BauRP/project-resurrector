import {describe,it,expect} from "vitest";
import {nativeRecordedModeEvidence} from "./native-recorded-mode-evidence";
const base={state:"saved",message:"",startedAt:1,stabilization:"unknown",stabilizationCaptureResultObserved:false,
 savedBytes:100000,savedUri:"",videoOnly:false,cameraId:"rear-0",width:1920,height:1080,fps:30,
 mp4TracksInspected:true,mp4HasVideoTrack:true,mp4HasAudioTrack:true,mp4FirstFrameDecodable:true,
 mp4VideoWidth:1920,mp4VideoHeight:1080,mp4VideoSamples:140,mp4AudioSamples:120,audioRequested:true};
describe("native Camera2 per-mode recorded evidence",()=>{
 it("records valid native MP4 evidence but does not claim full verification",()=>{
  const r=nativeRecordedModeEvidence(base,12345);
  expect(r?.api).toBe("camera2");
  expect(r?.state).toBe("recorded");
  expect(r?.file?.bytes).toBe(100000);
  expect(r?.message).toContain("не подтверждены");
 });
 it("does not fabricate success on missing audio, decoder or damaged timing",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4AudioSamples:0},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4FirstFrameDecodable:false},12345)?.state).toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4VideoTimestampDuplicates:2},12345)?.state).toBe("unknown");
 });
 it("marks a measured MP4 FPS mismatch as unconfirmed, not verified 60fps",()=>{
  expect(nativeRecordedModeEvidence({...base,fps:60,mp4SampledFps:24,mp4TailSampledFps:24},12345)?.state)
    .toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,fps:30,mp4SampledFps:29.7,mp4TailSampledFps:30.2},12345)?.state)
    .toBe("recorded");
  expect(nativeRecordedModeEvidence({...base,fps:30,mp4SampledFps:-1,mp4TailSampledFps:-1},12345)?.state)
    .toBe("recorded");
 });
 it("does not certify a long MP4 if its tail cannot decode",()=>{
  expect(nativeRecordedModeEvidence({...base,mp4DurationMs:10000,mp4TailFrameDecodable:false},12345)?.state)
    .toBe("unknown");
  expect(nativeRecordedModeEvidence({...base,mp4DurationMs:10000,mp4TailFrameDecodable:true},12345)?.state)
    .toBe("recorded");
  expect(nativeRecordedModeEvidence({...base,mp4DurationMs:1000,mp4TailFrameDecodable:false},12345)?.state)
    .toBe("recorded");
 });
 it("refuses unfinalized recording and unknown dimensions",()=>{
  expect(nativeRecordedModeEvidence({...base,state:"recording"},12345)).toBeNull();
  expect(nativeRecordedModeEvidence({...base,cameraId:""},12345)).toBeNull();
  expect(nativeRecordedModeEvidence({...base,mp4VideoWidth:0},12345)?.state).toBe("unknown");
 });
 it("marks interrupted recording with truthful warning",()=>{
  const r=nativeRecordedModeEvidence({...base,state:"saved_interrupted"},12345);
  expect(r?.message).toContain("прерывание");
  expect(r?.state).toBe("unknown");
 });
});