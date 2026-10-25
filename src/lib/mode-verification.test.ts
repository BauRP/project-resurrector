import { describe, expect, it } from "vitest";
import { classifyModeFailure } from "./mode-verification";
import { CameraBusyError, CameraSupersededError } from "./camera-controller";
describe("truthful mode diagnostics",()=>{
  it("marks explicit constraint incompatibility as rejected",()=>{
    expect(classifyModeFailure({name:"OverconstrainedError"},false)).toBe("rejected");
  });
  it("keeps busy, denied, timed out and cancelled modes unknown",()=>{
    expect(classifyModeFailure(new CameraBusyError(),false)).toBe("unknown");
    expect(classifyModeFailure(new CameraSupersededError(),false)).toBe("unknown");
    expect(classifyModeFailure({name:"NotAllowedError"},false)).toBe("unknown");
    expect(classifyModeFailure(new Error("timeout"),false)).toBe("unknown");
    expect(classifyModeFailure({name:"OverconstrainedError"},true)).toBe("unknown");
  });
});
