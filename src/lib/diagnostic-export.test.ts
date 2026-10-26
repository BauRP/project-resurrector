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
});