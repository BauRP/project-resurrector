import { describe, expect, it } from "vitest";
import { sanitizeViewState } from "./fold-ui-recovery";

describe("Activity recreation view restoration", () => {
  it("keeps real editor and camera navigation without reviving a recorder", () => {
    expect(sanitizeViewState({tab:"editor",playhead:32,editMode:"Cut",aspect:"16:9",captureKind:"video",
      recording:true,recordingPhase:"recording",cameraDeviceId:"old"})).toEqual({
      tab:"editor",playhead:32,editMode:"Cut",aspect:"16:9",captureKind:"video",
    });
  });
  it("rejects poisoned and invalid UI state", () => {
    expect(sanitizeViewState({tab:"unknown",playhead:Infinity,editMode:"X".repeat(400),
      aspect:"0;url(test)",captureKind:"mic"})).toEqual({});
    expect(sanitizeViewState(null)).toEqual({});
    expect(sanitizeViewState([])).toEqual({});
  });
});