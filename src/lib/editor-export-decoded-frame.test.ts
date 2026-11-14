import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isEditorDecodedFrameReady } from "./editor-export-decoded-frame";

const mockVideo = (readyState:number,videoWidth:number,videoHeight:number) =>
  ({readyState,videoWidth,videoHeight}) as HTMLVideoElement;

describe("WebView export survives decoder readiness and surface loss",()=>{
  it("accepts actual decoded frames at any original video duration",()=>{
    for(const seconds of [15,1800,3600,7200]){
      expect(seconds).toBeGreaterThan(0);
      expect(isEditorDecodedFrameReady(mockVideo(2,1920,1080))).toBe(true);
      expect(isEditorDecodedFrameReady(mockVideo(4,3840,2160))).toBe(true);
    }
  });
  it("does not submit metadata-only, missing or corrupted frames to Canvas",()=>{
    for(const state of [0,1]){
      expect(isEditorDecodedFrameReady(mockVideo(state,1920,1080))).toBe(false);
    }
    for(const width of [0,NaN,Infinity]){
      expect(isEditorDecodedFrameReady(mockVideo(2,width,1080))).toBe(false);
    }
    for(const height of [0,NaN,Infinity]){
      expect(isEditorDecodedFrameReady(mockVideo(2,1920,height))).toBe(false);
    }
  });
  it("all renderers report codec errors rather than leaving their promises stuck",()=>{
    const single=readFileSync("src/lib/editor-webm-render.ts","utf8");
    const multi=readFileSync("src/lib/editor-sequential-render.ts","utf8");
    expect(single).toContain("if(!isEditorDecodedFrameReady(video))");
    expect(multi).toContain("if(!isEditorDecodedFrameReady(video))");
    expect(single).toContain('terminate("Декодер видео перестал отдавать кадры: "');
    expect(multi).toContain('stop("Декодер видео перестал отдавать кадры: "');
    expect(single).toContain("}finally{\n        ctx.restore();");
    expect(single).toContain('window.addEventListener("pagehide",abort)');
    expect(single).toContain('window.removeEventListener("pagehide",abort)');
    expect(multi).toContain('window.addEventListener("pagehide",abort)');
    expect(single).toContain('video.onloadedmetadata=null;video.onseeked=null;video.onerror=null;');
    expect(single).toContain('canvas.captureStream(30)');
    expect(multi).toContain('canvas.captureStream(30)');
    expect(multi).toContain('audioSource.connect(audioDest)');
  });
});
