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

it("uses disclosed YUV sizes even on a lens without recording-sized HD streams",()=>{
 const small={...c,cameraId:"secondary",sizes:[],previewYuvSizes:["640x480"],fpsRanges:["15-30"]};
 expect(stabilizationTrialPlan([small],[])).toEqual([{cameraId:"secondary",width:640,height:480,fps:30}]);
 expect(stabilizationTrialPlan([{...small,previewYuvSizes:[]}],[])).toEqual([]);
});
it("retries a legacy declaration-only result but skips a measured baseline session",()=>{
 const small={...c,sizes:[],previewYuvSizes:["640x480"]};
 const declaration:StabilizationProbeResult={...saved,width:640,height:480,state:"declared-unavailable",selected:"none",eisDeclared:false,previewDeclared:false,oisDeclared:false,fpsRangeApplied:false};
 expect(stabilizationTrialPlan([small],[declaration])).toHaveLength(1);
 expect(stabilizationTrialPlan([small],[{...declaration,fpsRangeApplied:true}])).toEqual([]);
});
