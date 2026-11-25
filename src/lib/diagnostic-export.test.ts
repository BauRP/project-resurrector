import { describe,expect,it } from "vitest";
import { buildAnonymousCameraReport } from "./diagnostic-export";
import type { NativeCameraProfile, NativeMp4Inspection } from "./native";
import type { ModeEvidence } from "./camera-passport";

describe("anonymous offline diagnostic passport",()=>{
  it("does not export local camera IDs, paths, error details or browser context",()=>{
    const cam={cameraId:"SENSITIVE-CAMERA-ID",facing:"back",physicalCameraIds:["SENSITIVE-PHYSICAL-ID"],highSpeed:[],sizes:[],fpsRanges:[],profiles:[],isoRange:null,manualSensor:false,toneCurve:false} as NativeCameraProfile;
    const mode={cameraId:"SENSITIVE-WEBVIEW-ID",api:"webview",requested:{width:1920,height:1080,fps:30},state:"recorded",checkedAt:1,
      message:"SENSITIVE-ERROR",context:"SENSITIVE-USER-AGENT",file:{width:1920,height:1080,bytes:2048,mimeType:"video/webm"}} as ModeEvidence;
    const mp4={path:"SENSITIVE-LOCAL-PATH",bytes:2048,width:1920,height:1080,samplesRead:20,audioTrackCount:1,
      audioMime:"SENSITIVE-STRING"} as unknown as NativeMp4Inspection;
    const result=buildAnonymousCameraReport({nativeCameras:[cam],modes:[mode],mp4,checkedAt:"2026-10-27"});
    const text=JSON.stringify(result);
    for(const secret of ["SENSITIVE-CAMERA-ID","SENSITIVE-PHYSICAL-ID","SENSITIVE-WEBVIEW-ID",
      "SENSITIVE-ERROR","SENSITIVE-USER-AGENT","SENSITIVE-LOCAL-PATH","SENSITIVE-STRING"])
      expect(text).not.toContain(secret);
    expect(result.camera2[0]?.camera).not.toEqual(result.webviewModes[0]?.camera);
    expect(result.lastNativeMp4?.audioTrackCount).toBe(1);
  });
  it("keeps high-speed declaration candidates honest and anonymous",()=>{
    const cam:NativeCameraProfile={cameraId:"SECRET-CAMERA",facing:"back",physicalCameraIds:[],
      highSpeed:[{size:"1920x1080",fps:[120,240,240,NaN]},{size:"not-video",fps:[120]}],
      sizes:[],fpsRanges:[],profiles:[],isoRange:null,manualSensor:false,toneCurve:false};
    const report=buildAnonymousCameraReport({nativeCameras:[cam],modes:[],mp4:null,checkedAt:"2026-11-22"});
    expect(report.camera2[0]?.highSpeedDeclared).toEqual([
      {size:"1920x1080",fps:120,evidence:"camera2-declared-only"},
      {size:"1920x1080",fps:240,evidence:"camera2-declared-only"},
    ]);
    expect(JSON.stringify(report)).not.toContain("SECRET-CAMERA");
    expect(report.camera2[0]?.hdrRecordedAndVerified).toBe(false);
  });
});
describe("initial audit in the anonymous passport",()=>{
 it("exports the actual declared candidate plan without disclosing native identifiers or inventing recordings",()=>{
   const firstRun={schema:2,state:"complete",completed:1,total:1,advancedState:"pending",cameras:{
    "SECRET-ID":{cameraId:"SECRET-ID",source:"android-camera2-metadata",state:"metadata-collected",verifiedRecording:false,
    codecChecks:[{width:1920,height:1080,fpsRequested:30,status:"declared-compatible",recordedAndVerified:false,encoders:[{name:"SECRET-ENCODER",mime:"video/avc",declaredOnly:true}]}],
    functionalPlan:[{key:"SECRET-ID|1920|1080|30",cameraId:"SECRET-ID",width:1920,height:1080,fps:30,encoderName:"SECRET-ENCODER",encoderMime:"video/avc",status:"not-run",verifiedRecording:false,evidence:"declared-compatible-only"}]}
   }} as const;
   const report=buildAnonymousCameraReport({nativeCameras:[],modes:[],mp4:null,checkedAt:"2026-11-25",
    firstRun:firstRun as unknown as import("./first-run-camera-audit").CameraAuditCheckpoint});
   expect(report.firstRunCamera2?.cameras[0]?.plannedModes).toEqual([{width:1920,height:1080,fps:30,evidence:"declared-compatible-only",status:"not-run",verifiedRecording:false}]);
   expect(JSON.stringify(report)).not.toContain("SECRET-");
 });
});
