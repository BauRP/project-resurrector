import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { candidateWebViewModes, classifyModeFailure, decodedOutputMatchesRequested, decodedVideoModeEvidence, discoverWebViewModeCandidates, isVerifiedCameraIdentity, recordSample } from "./mode-verification";
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

describe("per-lens identity proof for WebView video modes", () => {
  it("accepts only the actual requested WebView camera identity", () => {
    expect(isVerifiedCameraIdentity("rear-wide","rear-wide")).toBe(true);
    expect(isVerifiedCameraIdentity("rear-wide","front")).toBe(false);
  });
  it("does not fabricate proof when OEM WebView hides the camera ID", () => {
    expect(isVerifiedCameraIdentity("rear-wide",undefined)).toBe(false);
    expect(isVerifiedCameraIdentity("rear-wide","")).toBe(false);
    expect(isVerifiedCameraIdentity("", "rear-wide")).toBe(false);
  });
});

describe("decoded output is required before saving a mode as recorded", () => {
  it("never upgrades a MediaRecorder blob to recorded before decode success", () => {
    const source=readFileSync("src/lib/mode-verification.ts","utf8");
    const start=source.indexOf("export async function verifyMode(");
    const verify=source.slice(start);
    expect(verify).not.toContain('result.state = "recorded";');
    const decoder=verify.indexOf("await verifyDecodedVideoBlob(blob, signal, 5000)");
    const state=verify.indexOf("result.state = evidence.state");
    expect(decoder).toBeGreaterThan(-1);
    expect(state).toBeGreaterThan(decoder);
    expect(verify).toContain('if (signal.aborted) throw new Error("Проверка отменена")');
    expect(verify).toContain('if (!frame.verifiedFirstFrame) throw new Error("Первый кадр не декодирован")');
  });
});
describe("separate actual coded FPS from stream and first-frame proof", () => {
  it("does not certify a 4K60 encoded mode from one decoded 4K frame", () => {
    const evidence=decodedVideoModeEvidence({width:3840,height:2160,fps:60},
      {width:3840,height:2160},200000);
    expect(evidence.state).toBe("recorded");
    expect(evidence.message).toContain("Частота кадров");
  });
  it("keeps actual decoded downscaling visible without claiming a verified mode", () => {
    const evidence=decodedVideoModeEvidence({width:3840,height:2160,fps:30},
      {width:1920,height:1080},200000);
    expect(evidence.state).toBe("rejected");
    expect(evidence.message).toContain("отличается");
  });
});

describe("per-WebView-lens mode discovery without false verification",()=>{
 const ranges={width:{min:320,max:1920},height:{min:240,max:1080},frameRate:{min:15,max:30}};
 it("filters each camera's test candidates by its actually reported numeric ranges",()=>{
  const modes=candidateWebViewModes(ranges);
  expect(modes.length).toBeGreaterThan(2);
  expect(modes.every(m=>m.width<=1920&&m.height<=1080&&m.fps<=30)).toBe(true);
  expect(modes.some(m=>m.width===1920&&m.fps===30)).toBe(true);
  expect(modes.some(m=>m.width===3840||m.fps===60)).toBe(false);
 });
 it("includes a valid actually opened mode and refuses malformed caps without claiming success",()=>{
  const modes=candidateWebViewModes(ranges,{width:1024,height:768,frameRate:29});
  expect(modes.some(m=>m.width===1024&&m.height===768)).toBe(true);
  expect(candidateWebViewModes({width:{min:-1,max:Infinity},height:ranges.height,frameRate:ranges.frameRate}))
    .toHaveLength(6);
 });
 it("bounds the generated modes even for huge capability ranges",()=>{
  const modes=candidateWebViewModes({width:{min:1,max:8000},height:{min:1,max:8000},frameRate:{min:1,max:240}});
  expect(modes.length).toBeLessThanOrEqual(24);
  expect(new Set(modes.map(m=>[m.width,m.height,m.fps].join("|"))).size).toBe(modes.length);
 });
 it("covers 4K, 2K, 1080p and 720p before the 24-mode diagnostic cap",()=>{
  const all=candidateWebViewModes({width:{min:1,max:8000},height:{min:1,max:8000},
    frameRate:{min:1,max:240}});
  const widths=new Set(all.map(m=>m.width));
  for(const width of [3840,2560,1920,1280])expect(widths.has(width)).toBe(true);
  expect(all).toHaveLength(24);
  expect(all[0]).toEqual({width:1920,height:1080,fps:30});
  expect(all.some(m=>m.width===3840&&m.fps===60)).toBe(true);
 });
 it("keeps the measured 29.97 FPS candidate rather than rounding outside OEM limits",()=>{
  const modes=candidateWebViewModes({
    width:{min:1280,max:1280},height:{min:720,max:720},
    frameRate:{min:29.97,max:29.97}
  },{width:1280,height:720,frameRate:29.97});
  expect(modes).toEqual([{width:1280,height:720,fps:29.97}]);
 });
 it("never proposes unsupported generic modes outside a reported valid capability range",()=>{
  expect(candidateWebViewModes({width:{min:100,max:160},height:{min:100,max:160},
    frameRate:{min:7,max:12}})).toEqual([]);
  expect(candidateWebViewModes({width:{min:100,max:160},height:{min:100,max:160},
    frameRate:{min:7,max:12}},{width:144,height:144,frameRate:10}))
    .toEqual([{width:144,height:144,fps:10}]);
 });
 it("never opens a camera when discovery was cancelled",async()=>{
  const cancel=new AbortController();cancel.abort();
  const result=await discoverWebViewModeCandidates("rear",cancel.signal);
  expect(result.modes).toEqual([]);
  expect(result.source).toBe("fallback");
 });
});
