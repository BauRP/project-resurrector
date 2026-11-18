import { describe, expect, it } from "vitest";
import { cameraAuditProgress, type CameraAuditCheckpoint } from "./first-run-camera-audit";

const checkpoint = (state:CameraAuditCheckpoint["state"], completed:number, total:number):CameraAuditCheckpoint => ({
  schema:2,state,completed,total,advancedState:"pending",cameras:{},
});

describe("first-install Camera2 inventory progress", () => {
  it("starts at zero and counts only stored completed camera entries", () => {
    expect(cameraAuditProgress(checkpoint("not-started",0,0))).toBe(0);
    expect(cameraAuditProgress(checkpoint("running",1,4))).toBe(25);
    expect(cameraAuditProgress(checkpoint("running",2,4))).toBe(50);
  });
  it("does not claim completion before the atomic final checkpoint", () => {
    expect(cameraAuditProgress(checkpoint("running",4,4))).toBe(99);
    expect(cameraAuditProgress(checkpoint("retry",2,4))).toBe(50);
    expect(cameraAuditProgress(checkpoint("complete",4,4))).toBe(100);
    expect(cameraAuditProgress(checkpoint("complete",0,0))).toBe(100);
  });
  it("does not confuse declared video modes with verified user recordings", () => {
    const state = checkpoint("complete",1,1);
    state.cameras["rear"] = {
      cameraId:"rear",
      source:"android-camera2-metadata",
      verifiedRecording:false,
      state:"metadata-collected",
      metadataOnly:true,
      stillPhotoSizesDeclared:[{width:4000,height:3000}],
      videoModeCandidatesDeclared:[{
        width:3840,height:2160,
        minimumFrameDurationNs:33333333,
        theoreticalUpperFps:30,
        verifiedVideoRecording:false,
      }],
    };
    expect(cameraAuditProgress(state)).toBe(100);
    expect(state.cameras["rear"]?.verifiedRecording).toBe(false);
    expect(state.cameras["rear"]?.videoModeCandidatesDeclared?.[0]?.verifiedVideoRecording).toBe(false);
    expect(state.advancedState).toBe("pending");
  });
  it("rejects corrupt negative or missing totals and impossible overflows", () => {
    expect(cameraAuditProgress(checkpoint("running",-1,4))).toBe(0);
    expect(cameraAuditProgress(checkpoint("running",10,4))).toBe(99);
    expect(cameraAuditProgress(checkpoint("running",2,-1))).toBe(0);
  });
});
