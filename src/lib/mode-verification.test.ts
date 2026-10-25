import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyModeFailure, decodedOutputMatchesRequested, recordSample } from "./mode-verification";
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

describe("mode-probe MediaRecorder lifecycle", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it("rejects bytes from an encoder that never actually signaled onstart", async () => {
    vi.useFakeTimers();
    class SilentRecorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      onstart: (()=>void)|null=null;
      onstop: (()=>void)|null=null;
      ondataavailable: ((event:{data:Blob})=>void)|null=null;
      onerror: (()=>void)|null=null;
      start() { this.state="recording"; }
      stop() {
        this.state="inactive";
        this.ondataavailable?.({data:new Blob(["x".repeat(2048)])});
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder",SilentRecorder);
    const outcome=recordSample({} as MediaStream,new AbortController().signal);
    const rejected=expect(outcome).rejects.toThrow(/запуск/);
    await vi.advanceTimersByTimeAsync(4100);
    await rejected;
  });
  it("accepts an actual onstart followed by encoded data and onstop", async () => {
    vi.useFakeTimers();
    class StartingRecorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      onstart: (()=>void)|null=null;
      onstop: (()=>void)|null=null;
      ondataavailable: ((event:{data:Blob})=>void)|null=null;
      onerror: (()=>void)|null=null;
      start() { this.state="recording"; this.onstart?.(); }
      stop() {
        this.state="inactive";
        this.ondataavailable?.({data:new Blob(["x".repeat(2048)])});
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder",StartingRecorder);
    const result=recordSample({} as MediaStream,new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1600);
    expect((await result).size).toBe(2048);
  });
});
