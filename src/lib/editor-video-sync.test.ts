import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { shouldCorrectPlayingVideo, pauseVideoAfterLatePlay } from "./editor-video-sync";

describe("Editor video decoder stays responsive when scrubbing and playing", () => {
  it("keeps sub-280ms drift without forcing decoder seeks", () => {
    expect(shouldCorrectPlayingVideo(1.8,2.0,1.96,false,2000,0)).toBe(false);
    expect(shouldCorrectPlayingVideo(1.7,2.0,1.96,true,2000,0)).toBe(false);
  });
  it("throttles drift corrections to avoid seek loops on old Android WebView", () => {
    expect(shouldCorrectPlayingVideo(1.5,2.0,1.97,false,1200,900)).toBe(false);
    expect(shouldCorrectPlayingVideo(1.5,2.0,1.97,false,1550,900)).toBe(true);
    expect(shouldCorrectPlayingVideo(1.5,2.0,1.97,false,1551,1550)).toBe(false);
  });
  it("does not delay explicit large timeline jumps", () => {
    expect(shouldCorrectPlayingVideo(1,4,1.0,false,1001,1000)).toBe(true);
    expect(shouldCorrectPlayingVideo(1,4,3.9,true,2000,1000)).toBe(false);
  });
  it("stops a delayed play promise after Pause without touching active playback", () => {
    let paused = false;
    let calls = 0;
    const video = {
      get paused() { return paused; },
      pause() { paused = true; calls++; },
    };
    pauseVideoAfterLatePlay(video, true);
    expect(calls).toBe(0);
    pauseVideoAfterLatePlay(video, false);
    expect(calls).toBe(1);
    pauseVideoAfterLatePlay(video, false);
    expect(calls).toBe(1);
  });
  it("ensures late play callbacks cannot affect a replaced decoder session", () => {
    const layer=readFileSync("src/components/multicam/EditorVideoLayer.tsx","utf8");
    expect(layer).toContain("sourceSession.current++");
    expect(layer).toContain("sourceSession.current===session");
    expect(layer).toContain("wantsPlayback.current=playing&&!reverse");
    expect(layer).toContain("pauseVideoAfterLatePlay(v,wantsPlayback.current)");
  });
  it("guards unavailable video times and prevents repeated concurrent play promises", () => {
    expect(shouldCorrectPlayingVideo(NaN,3,2,false,2000,0)).toBe(false);
    const layer=readFileSync("src/components/multicam/EditorVideoLayer.tsx","utf8");
    expect(layer).toContain("pendingPlay.current");
    expect(layer).toContain("lastPlayAttempt.current>=500");
    expect(layer).toContain("shouldCorrectPlayingVideo(");
    expect(layer).toContain('v.removeAttribute("src");v.load()');
    expect(layer).toContain("playsInline preload=\"metadata\"");
  });
});
