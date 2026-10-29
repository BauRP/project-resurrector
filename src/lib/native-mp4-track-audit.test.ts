import {describe,it,expect} from "vitest";
import {nativeMp4TrackStatus} from "./native-capture";
describe("finalized MP4 track audit after folding",()=>{
 it("never converts missing parser evidence into confirmed missing audio",()=>{
  expect(nativeMp4TrackStatus({audioRequested:true,mp4TracksInspected:false})).toBe("unknown");
 });
 it("detects missing requested audio without silently calling capture complete",()=>{
  expect(nativeMp4TrackStatus({audioRequested:true,mp4TracksInspected:true,mp4HasVideoTrack:true,mp4HasAudioTrack:false})).toBe("missing-audio");
 });
 it("permits explicitly silent video when its video track was found",()=>{
  expect(nativeMp4TrackStatus({audioRequested:false,mp4TracksInspected:true,mp4HasVideoTrack:true,mp4HasAudioTrack:false})).toBe("complete");
 });
 it("does not conflate rotated video metadata with actual encoded track size",()=>{
  expect(nativeMp4TrackStatus({mp4TracksInspected:true,mp4HasVideoTrack:true,
    width:1920,height:1080,mp4VideoWidth:1080,mp4VideoHeight:1920}))
    .toBe("size-mismatch");
 });
 it("does not certify requested mode when encoded dimensions are not measured",()=>{
  expect(nativeMp4TrackStatus({mp4TracksInspected:true,mp4HasVideoTrack:true,
    width:1920,height:1080,mp4VideoWidth:0,mp4VideoHeight:0})).toBe("unknown");
 });
 it("flags missing video and changed dimensions",()=>{
  expect(nativeMp4TrackStatus({mp4TracksInspected:true,mp4HasVideoTrack:false})).toBe("missing-video");
  expect(nativeMp4TrackStatus({mp4TracksInspected:true,mp4HasVideoTrack:true,width:1920,height:1080,mp4VideoWidth:1280,mp4VideoHeight:720})).toBe("size-mismatch");
 });
});