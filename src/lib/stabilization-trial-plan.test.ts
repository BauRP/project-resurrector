import {describe,it,expect} from "vitest";
import {stabilizationTrialPlan} from "./stabilization-trial-plan";
import type {NativeCameraProfile} from "./native";
import type {StabilizationProbeResult} from "./stabilization-probe";
const c={cameraId:"rear",sizes:["1280x720","1920x1080"],fpsRanges:["15-30","30-60"],videoOutputSizes:[{width:1920,height:1080,theoreticalMaxFps:30}]} as NativeCameraProfile;
const saved:StabilizationProbeResult={cameraId:"rear",width:1280,height:720,fpsRequested:30,source:"camera2-capture-result",selected:"eis",state:"capture-result-confirmed",eisDeclared:true,oisDeclared:false,previewDeclared:false,recordedFileVerified:false,message:"",framesObserved:3,confirmations:3,captureResultEis:1,fpsRangeApplied:true,fpsRangeMin:15,fpsRangeMax:30};
describe("resumable stabilization trials",()=>{
 it("skips saved exact modes and avoids unsupported 1080p60",()=>{
  expect(stabilizationTrialPlan([c,c],[saved])).toEqual([{cameraId:"rear",width:1920,height:1080,fps:30},{cameraId:"rear",width:1280,height:720,fps:60}]);
 });
 it("does not skip a different lens or legacy unconfirmed FPS evidence",()=>{
  expect(stabilizationTrialPlan([{...c,cameraId:"front"}],[saved])).toHaveLength(3);
  expect(stabilizationTrialPlan([c],[{...saved,fpsRangeApplied:false}])).toHaveLength(3);
 });
});
