import { describe, expect, it } from "vitest";
import { cameraAuditProgress, cameraAuditPhase, cameraAuditPauseReason, cameraAuditPlanComplete, type CameraAuditCheckpoint } from "./first-run-camera-audit";

const checkpoint = (state:CameraAuditCheckpoint["state"], completed:number, total:number):CameraAuditCheckpoint => ({
  schema:2,state,completed,total,advancedState:"pending",
  codecIntegrityVersion:1,codecRowsValid:true,planRowsValid:true,cameras:{},
});

describe("first-install Camera2 inventory progress", () => {
  it("starts at zero and counts only stored completed camera entries", () => {
    expect(cameraAuditProgress(checkpoint("not-started",0,0))).toBe(0);
    expect(cameraAuditProgress(checkpoint("running",1,4))).toBe(8);
    expect(cameraAuditProgress(checkpoint("running",2,4))).toBe(16);
  });
  it("does not claim completion before the atomic final checkpoint", () => {
    expect(cameraAuditProgress(checkpoint("running",4,4))).toBe(33);
    expect(cameraAuditProgress(checkpoint("retry",2,4))).toBe(16);
    expect(cameraAuditProgress(checkpoint("complete",4,4))).toBe(33);
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
    expect(cameraAuditProgress(state)).toBe(66);
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
    expect(cameraAuditProgress(saved)).toBe(50);
    const interrupted = {...saved, codecState: "retry" as const};
    expect(cameraAuditProgress(interrupted)).toBe(50);
    const finished = {...saved, codecState: "complete" as const,codecCompleted:4};
    expect(cameraAuditProgress(finished)).toBe(66);
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
  it("refuses poisoned negative totals and stale per-camera codec evidence",()=>{
    const invalid=checkpoint("complete",-1,-1);
    invalid.codecState="complete";invalid.codecTotal=-1;invalid.codecCompleted=-1;
    invalid.planState="complete";invalid.planVersion=2;invalid.planTotal=-1;invalid.planCompleted=-1;
    expect(cameraAuditPhase(invalid)).toBe("metadata");
    expect(cameraAuditPlanComplete(invalid)).toBe(false);
    expect(cameraAuditProgress(invalid)).toBe(0);
    const stale=checkpoint("complete",2,2);
    stale.codecState="complete";stale.codecTotal=2;stale.codecCompleted=2;
    stale.planState="complete";stale.planVersion=2;stale.planTotal=2;stale.planCompleted=2;
    stale.codecIntegrityVersion=0;
    expect(cameraAuditPhase(stale)).toBe("codecs");
    expect(cameraAuditPlanComplete(stale)).toBe(false);
    expect(cameraAuditProgress(stale)).toBeLessThan(100);
    stale.codecIntegrityVersion=1;
    expect(cameraAuditPlanComplete(stale)).toBe(true);
  });
  it("rejects a global complete counter if one lens is missing a codec or plan checkpoint",()=>{
    const state=checkpoint("complete",2,2);
    state.codecState="complete";state.codecCompleted=2;state.codecTotal=2;
    state.planState="complete";state.planCompleted=2;state.planTotal=2;state.planVersion=2;
    expect(cameraAuditPlanComplete(state)).toBe(true);
    state.codecRowsValid=false;
    expect(cameraAuditPhase(state)).toBe("codecs");
    expect(cameraAuditPlanComplete(state)).toBe(false);
    expect(cameraAuditProgress(state)).toBeLessThan(100);
    state.codecRowsValid=true;state.planRowsValid=false;
    expect(cameraAuditPhase(state)).toBe("done");
    expect(cameraAuditPlanComplete(state)).toBe(false);
    expect(cameraAuditProgress(state)).toBe(99);
    state.planRowsValid=true;
    expect(cameraAuditPlanComplete(state)).toBe(true);
  });
  it("only completes the saved candidate plan when all three stage counters match",()=>{
    const state=checkpoint("complete",3,3);
    state.codecState="complete";state.codecTotal=3;state.codecCompleted=3;
    state.planState="complete";state.planVersion=2;state.planTotal=3;state.planCompleted=1;
    expect(cameraAuditPhase(state)).toBe("done");
    expect(cameraAuditPlanComplete(state)).toBe(false);
    state.planCompleted=3;
    expect(cameraAuditPlanComplete(state)).toBe(true);
    state.planTotal=2;
    expect(cameraAuditPlanComplete(state)).toBe(false);
    state.planTotal=3;state.state="retry";
    expect(cameraAuditPlanComplete(state)).toBe(false);
    state.state="complete";state.planVersion=1;
    expect(cameraAuditPlanComplete(state)).toBe(false);
    state.planVersion=2;
    expect(cameraAuditPlanComplete(state)).toBe(true);
    const noCameras=checkpoint("complete",0,0);
    noCameras.codecState="complete";noCameras.codecTotal=0;noCameras.codecCompleted=0;
    noCameras.planState="complete";noCameras.planVersion=2;noCameras.planTotal=0;noCameras.planCompleted=0;
    expect(cameraAuditPlanComplete(noCameras)).toBe(true);
  });
  it("reports three saved stages without premature 100% or fictitious recordings",()=>{
    const state=checkpoint("complete",4,4);
    state.codecState="complete";state.codecTotal=4;state.codecCompleted=4;
    // Two out of three stages complete is only ~66%, not 100%.
    expect(cameraAuditProgress(state)).toBe(66);
    state.planVersion=2;state.planState="running";state.planTotal=4;state.planCompleted=1;
    expect(cameraAuditProgress(state)).toBe(75);
    state.planCompleted=3;
    expect(cameraAuditProgress(state)).toBe(91);
    state.planCompleted=4;
    expect(cameraAuditProgress(state)).toBe(99);
    state.planState="complete";
    expect(cameraAuditProgress(state)).toBe(100);
    expect(state.recordingValidated).not.toBe(true);
    state.planVersion=1;
    expect(cameraAuditProgress(state)).toBe(66);
    state.planVersion=2;state.planTotal=3;
    expect(cameraAuditProgress(state)).toBe(66);
    state.planTotal=4;state.planState="retry";
    expect(cameraAuditProgress(state)).toBe(99);
  });
  it("caps progress below 100 when codec evidence is incomplete", () => {
    const state = checkpoint("complete",3,3);
    state.codecState = "running";
    state.codecTotal = 3;
    state.codecCompleted = 3;
    expect(cameraAuditProgress(state)).toBe(66);
    state.codecState = "retry";
    expect(cameraAuditProgress(state)).toBe(66);
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
    expect(cameraAuditProgress(state)).toBe(66);
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
    expect(cameraAuditProgress(completed)).toBe(66);
    expect(completed.recordingValidated).toBe(false);
    expect(completed.camera2InventoryOnly).toBe(true);
  });
  it("keeps severe heat and low-memory pauses distinct from missing hardware support", () => {
    const heat = checkpoint("retry", 1, 2);
    heat.error = "thermal-severe";
    expect(cameraAuditPauseReason(heat)).toContain("нагрев");
    expect(cameraAuditProgress(heat)).toBe(16);
    const lowMemory = checkpoint("complete",2,2);
    lowMemory.codecState = "retry";
    lowMemory.codecTotal = 2;
    lowMemory.codecCompleted = 1;
    lowMemory.codecError = "low-memory";
    expect(cameraAuditPauseReason(lowMemory)).toContain("памяти");
    expect(cameraAuditProgress(lowMemory)).toBe(50);
    expect(cameraAuditPauseReason({...lowMemory, codecState: "complete"})).toBeNull();
    const planning = checkpoint("complete",2,2);
    planning.codecState = "complete";
    planning.planState = "retry";
    planning.planError = "thermal-severe";
    expect(cameraAuditPauseReason(planning)).toContain("нагрев");
  });
  it("rejects corrupt negative or missing totals and impossible overflows", () => {
    expect(cameraAuditProgress(checkpoint("running",-1,4))).toBe(0);
    expect(cameraAuditProgress(checkpoint("running",10,4))).toBe(33);
    expect(cameraAuditProgress(checkpoint("running",2,-1))).toBe(0);
  });
});
