import { describe, expect, it, vi } from "vitest";
import { bounded } from "./async";
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
  it("does not hang forever when a folded Android Activity stops responding to owner queries",async()=>{
    vi.useFakeTimers();
    try {
      const never=new Promise<{state:string}>(()=>undefined);
      const request=bounded(never,2200,"Camera2 startup ownership");
      const expectation=expect(request).rejects.toThrow("timeout");
      await vi.advanceTimersByTimeAsync(2200);
      await expectation;
      const source=readFileSync("src/components/multicam/CameraWorkspace.tsx","utf8");
      expect(source).toContain('bounded(nativeCapture.status(), 2200, "Camera2 startup ownership")');
      expect(source).toContain('bounded(nativeCapture.status(), 2200, "Camera2 mode handoff")');
      expect(source).toContain('setMode("native")');
    }finally{vi.useRealTimers();}
  });
  it("rechecks fresh state after native status resolves, before changing the camera owner", () => {
    const source=readFileSync("src/components/multicam/CameraWorkspace.tsx","utf8");
    expect(source).toContain("mayFinishCameraOwnerSwitch(mounted.current, latestRecording.current, latestPhase.current)");
    expect(source.indexOf("mayFinishCameraOwnerSwitch(mounted.current"))
      .toBeLessThan(source.indexOf("setMode(next);"));
    expect(source).toContain("return () => { mounted.current = false; };");
    expect(source).toContain("useSyncExternalStore(diagnosticCaptureGate.subscribe, diagnosticCaptureGate.getSnapshot)");
  });
});
