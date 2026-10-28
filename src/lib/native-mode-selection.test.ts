import {describe,expect,it} from "vitest";
import {nativeFpsCandidates,validNativeSelection} from "./native-mode-selection";
const camera={sizes:["1280x720","1920x1080"],fpsRanges:["15-30","30-60"],
 videoOutputSizes:[{width:1280,height:720,theoreticalMaxFps:60},{width:1920,height:1080,theoreticalMaxFps:30}]};
describe("native per-lens candidate selection",()=>{
 it("respects output timing before offering 60 FPS",()=>{
  expect(nativeFpsCandidates(camera,"1920x1080")).toEqual([24,25,30]);
  expect(nativeFpsCandidates(camera,"1280x720")).toEqual([24,25,30,60]);
 });
 it("does not guess when the mode or its FPS ranges are absent",()=>{
  expect(nativeFpsCandidates(camera,"3840x2160")).toEqual([]);
  expect(nativeFpsCandidates({...camera,fpsRanges:[]},"1920x1080")).toEqual([]);
 });
 it("restores a safe candidate after changing physical lens",()=>{
  expect(validNativeSelection(camera,"3840x2160",60)).toEqual({size:"1920x1080",fps:30,choices:[24,25,30]});
 });
});
