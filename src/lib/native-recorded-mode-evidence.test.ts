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