import { describe, expect, it } from "vitest";
import { classifyModeFailure, decodedOutputMatchesRequested } from "./mode-verification";
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

describe("independent encoded frame size evidence", () => {
  it("accepts a decoded clip matching requested video dimensions, including rotation", () => {
    expect(decodedOutputMatchesRequested({width:1920,height:1080,fps:30},{width:1920,height:1080})).toBe(true);
    expect(decodedOutputMatchesRequested({width:1920,height:1080,fps:30},{width:1080,height:1920})).toBe(true);
  });
  it("rejects silently resized or downscaled video files", () => {
    expect(decodedOutputMatchesRequested({width:3840,height:2160,fps:30},{width:1920,height:1080})).toBe(false);
  });
});
