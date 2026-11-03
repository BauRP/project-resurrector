import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { ForegroundReturnEpoch, mayRecoverForegroundPreview,
  type ForegroundPreviewStatus } from "./camera-foreground-recovery";

const live = {getVideoTracks: () => [{readyState:"live"} as MediaStreamTrack]};
const dead = {getVideoTracks: () => [{readyState:"ended"} as MediaStreamTrack]};
const status=(overrides:Partial<ForegroundPreviewStatus>={}) : ForegroundPreviewStatus => ({
  visible:true,recording:false,phase:"idle",preview:"unavailable",stream:dead,
  selectedDeviceMissing:false,...overrides,
});
describe("Camera foreground recovery without losing capture on Android fold",()=>{
  it("does not restart preview while either recorder is active or saving",()=>{
    const returnEpoch=new ForegroundReturnEpoch();
    returnEpoch.markReturned();
    for(const phase of ["starting","recording","stopping","saving"] as const){
      expect(returnEpoch.consumeWhenReady(status({phase}))).toBe(false);
      expect(returnEpoch.hasPending()).toBe(true);
    }
    expect(returnEpoch.consumeWhenReady(status({phase:"saved"}))).toBe(true);
    expect(returnEpoch.hasPending()).toBe(false);
    expect(returnEpoch.consumeWhenReady(status({phase:"saved"}))).toBe(false);
  });
  it("does not reacquire an already live preview or missing selected external sensor",()=>{
    expect(mayRecoverForegroundPreview(status({preview:"live",stream:live}))).toBe(false);
    expect(mayRecoverForegroundPreview(status({selectedDeviceMissing:true}))).toBe(false);
    expect(mayRecoverForegroundPreview(status({visible:false}))).toBe(false);
    expect(mayRecoverForegroundPreview(status({preview:"loading"}))).toBe(false);
  });
  it("does not lose a pending return when Activity remains hidden or preview is loading",()=>{
    const epoch=new ForegroundReturnEpoch();
    epoch.markReturned();
    expect(epoch.consumeWhenReady(status({visible:false}))).toBe(false);
    expect(epoch.consumeWhenReady(status({preview:"loading"}))).toBe(false);
    expect(epoch.consumeWhenReady(status({recording:true}))).toBe(false);
    expect(epoch.hasPending()).toBe(true);
    expect(epoch.consumeWhenReady(status())).toBe(true);
  });
  it("prevents a healthy video track from being restarted just because the layout changed",()=>{
    expect(mayRecoverForegroundPreview(status({preview:"live",stream:live}))).toBe(false);
    expect(mayRecoverForegroundPreview(status({preview:"live",stream:dead}))).toBe(true);
    expect(mayRecoverForegroundPreview(status({preview:"unavailable",stream:null}))).toBe(true);
  });
  it("wires pageshow and visibilitychange to a distinct preview revision, not recording commands",()=>{
    const source=readFileSync("src/components/multicam/CameraTab.tsx","utf8");
    expect(source).toContain('window.addEventListener("pageshow", returned)');
    expect(source).toContain('document.addEventListener("visibilitychange", returned)');
    expect(source).toContain("foregroundReturn.current.consumeWhenReady(status)");
    expect(source).toContain("selectedDeviceMissing: missingSelectedLens.current || missingSelectedMicrophone.current");
    expect(source).toContain("setHotplugRevision(revision => revision + 1)");
    expect(source).not.toContain("foregroundReturn.current.markReturned();\n      s.toggleRecording()");
  });
});
