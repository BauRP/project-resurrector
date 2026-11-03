import { describe, expect, it } from "vitest";
import { mayFinishCameraOwnerSwitch } from "./camera-owner-handoff";
import { readFileSync } from "node:fs";

describe("Camera2 and WebView ownership during async fold and record transitions", () => {
  it("only transfers between camera paths when the screen is alive and both recorders are idle", () => {
    expect(mayFinishCameraOwnerSwitch(true,false,"idle")).toBe(true);
    expect(mayFinishCameraOwnerSwitch(true,false,"saved")).toBe(true);
    expect(mayFinishCameraOwnerSwitch(false,false,"idle")).toBe(false);
    expect(mayFinishCameraOwnerSwitch(true,true,"idle")).toBe(false);
    for (const phase of ["starting","recording","stopping","saving"]) {
      expect(mayFinishCameraOwnerSwitch(true,false,phase)).toBe(false);
    }
  });
  it("rechecks fresh state after native status resolves, before changing the camera owner", () => {
    const source=readFileSync("src/components/multicam/CameraWorkspace.tsx","utf8");
    expect(source).toContain("mayFinishCameraOwnerSwitch(mounted.current, latestRecording.current, latestPhase.current)");
    expect(source.indexOf("mayFinishCameraOwnerSwitch(mounted.current"))
      .toBeLessThan(source.indexOf("setMode(next);"));
    expect(source).toContain("return () => { mounted.current = false; };");
  });
});
