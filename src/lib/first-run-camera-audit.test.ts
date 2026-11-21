import { describe, expect, it } from "vitest";
import { cameraAuditProgress, cameraAuditPhase, cameraAuditPauseReason, type CameraAuditCheckpoint } from "./first-run-camera-audit";

const checkpoint = (state:CameraAuditCheckpoint["state"], completed:number, total:number):CameraAuditCheckpoint => ({
  schema:2,state,completed,total,advancedState:"pending",cameras:{},
});

describe("first-install Camera2 inventory progress", () => {
  it("starts at zero and counts only stored completed camera entries", () => {
    expect(cameraAuditProgress(checkpoint("not-started",0,0))).toBe(0);
    expect(cameraAuditProgress(checkpoint("running",1,4))).toBe(12);
    expect(cameraAuditProgress(checkpoint("running",2,4))).toBe(25);
  });
  it("does not claim completion before the atomic final checkpoint", () => {
    expect(cameraAuditProgress(checkpoint("running",4,4))).toBe(50);
    expect(cameraAuditProgress(checkpoint("retry",2,4))).toBe(25);
    expect(cameraAuditProgress(checkpoint("complete",4,4))).toBe(50);
    expect(cameraAuditProgress(checkpoint("complete",0,0))).toBe(0);
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
    state.codecState = "complete";
    state.codecCompleted = 1;
    state.codecTotal = 1;
    expect(cameraAuditProgress(state)).toBe(100);
    expect(state.cameras["rear"]?.verifiedRecording).toBe(false);
    expect(state.cameras["rear"]?.videoModeCandidatesDeclared?.[0]?.verifiedVideoRecording).toBe(false);
    expect(state.advancedState).toBe("pending");
  });
  it("continues from a saved codec checkpoint without counting unverified recordings", () => {
    const saved = checkpoint("complete",4,4);
    saved.codecState = "running";
    saved.codecTotal = 4;
    saved.codecCompleted = 2;
    expect(cameraAuditPhase(saved)).toBe("codecs");
    expect(cameraAuditProgress(saved)).toBe(75);
    const interrupted = {...saved, codecState: "retry" as const};
    expect(cameraAuditProgress(interrupted)).toBe(75);
    const finished = {...saved, codecState: "complete" as const,codecCompleted:4};
    expect(cameraAuditProgress(finished)).toBe(100);
    expect(cameraAuditPhase(finished)).toBe("done");
  });
  it("does not report completed for contradictory or missing atomic counters",()=>{
    const metadata = checkpoint("complete",1,2);
    metadata.codecState = "complete";
    metadata.codecTotal = 2;
    metadata.codecCompleted = 2;
    expect(cameraAuditProgress(metadata)).toBeLessThan(100);
    expect(cameraAuditPhase(metadata)).toBe("metadata");
    const codec = checkpoint("complete",2,2);
    codec.codecState = "complete";
    codec.codecTotal = 2;
    codec.codecCompleted = 1;
    expect(cameraAuditProgress(codec)).toBeLessThan(100);
    expect(cameraAuditPhase(codec)).toBe("codecs");
    const missing = checkpoint("complete",2,2);
    missing.codecState = "complete";
    expect(cameraAuditProgress(missing)).toBeLessThan(100);
    expect(cameraAuditPhase(missing)).toBe("codecs");
  });
  it("caps progress below 100 when codec evidence is incomplete", () => {
    const state = checkpoint("complete",3,3);
    state.codecState = "running";
    state.codecTotal = 3;
    state.codecCompleted = 3;
    expect(cameraAuditProgress(state)).toBe(99);
    state.codecState = "retry";
    expect(cameraAuditProgress(state)).toBe(99);
    expect(cameraAuditPhase(state)).toBe("codecs");
  });
  it("keeps saved encoder declarations separate from actual video evidence", () => {
    const state = checkpoint("complete",1,1);
    state.codecState = "complete";
    state.codecCompleted = 1;
    state.codecTotal = 1;
    state.cameras["0"] = {
      cameraId: "0",
      source: "android-camera2-metadata",
      state: "metadata-collected",
      verifiedRecording: false,
      codecState: "complete",
      codecChecks: [{
        width: 1920, height: 1080, fpsRequested: 30,
        recordedAndVerified: false,
        status: "declared-compatible",
        encoders: [{name:"vendor.encoder",mime:"video/avc",declaredOnly:true}],
      }],
    };
    expect(cameraAuditProgress(state)).toBe(100);
    expect(state.cameras["0"]!.codecChecks![0]!.recordedAndVerified).toBe(false);
    expect(state.cameras["0"]!.verifiedRecording).toBe(false);
  });
  it("cannot claim recording verified when both metadata stages are completed", () => {
    const completed = checkpoint("complete",2,2);
    completed.codecState = "complete";
    completed.codecCompleted = 2;
    completed.codecTotal = 2;
    completed.recordingValidated = false;
    completed.camera2InventoryOnly = true;
    expect(cameraAuditPhase(completed)).toBe("done");
    expect(cameraAuditProgress(completed)).toBe(100);
    expect(completed.recordingValidated).toBe(false);
    expect(completed.camera2InventoryOnly).toBe(true);
  });
  it("keeps severe heat and low-memory pauses distinct from missing hardware support", () => {
    const heat = checkpoint("retry", 1, 2);
    heat.error = "thermal-severe";
    expect(cameraAuditPauseReason(heat)).toContain("нагрев");
    expect(cameraAuditProgress(heat)).toBe(25);
    const lowMemory = checkpoint("complete",2,2);
    lowMemory.codecState = "retry";
    lowMemory.codecTotal = 2;
    lowMemory.codecCompleted = 1;
    lowMemory.codecError = "low-memory";
    expect(cameraAuditPauseReason(lowMemory)).toContain("памяти");
    expect(cameraAuditProgress(lowMemory)).toBe(75);
    expect(cameraAuditPauseReason({...lowMemory, codecState: "complete"})).toBeNull();
    const planning = checkpoint("complete",2,2);
    planning.codecState = "complete";
    planning.planState = "retry";
    planning.planError = "thermal-severe";
    expect(cameraAuditPauseReason(planning)).toContain("нагрев");
  });
  it("rejects corrupt negative or missing totals and impossible overflows", () => {
    expect(cameraAuditProgress(checkpoint("running",-1,4))).toBe(0);
    expect(cameraAuditProgress(checkpoint("running",10,4))).toBe(50);
    expect(cameraAuditProgress(checkpoint("running",2,-1))).toBe(0);
  });
});
