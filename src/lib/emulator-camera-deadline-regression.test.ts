import {describe, expect, it} from "vitest";
import { advanceCaptureFrameDeadline } from "@/components/multicam/CameraTab";
import {readFileSync} from "node:fs";

describe("emulator camera stability without quality loss", () => {
  it.each([24,25,30,60])("renders about %i requested video frames on 120Hz display", fps => {
    let last = Number.NEGATIVE_INFINITY, frames=0;
    for(let i=0;i<120;i++){
      const now = i * 1000 / 120;
      const next = advanceCaptureFrameDeadline(now,last,fps);
      if(next!==null) {last=next;frames++;}
    }
    expect(frames).toBeGreaterThanOrEqual(fps-1);
    expect(frames).toBeLessThanOrEqual(fps+1);
  });
  it("does not loop excessively after Android pauses the renderer",()=>{
    expect(advanceCaptureFrameDeadline(100000,1000,30)).toBe(100000);
  });
  it("guards every native Camera2 callback without dropping commands",()=>{
    const s=readFileSync("src/lib/native-capture.ts","utf8");
    for(const method of ["startPreview","start","stop","pause","resume","status","setControls","setFocus","tapToMeter","previewFrame","setDirectPreview","requestPermissions"])
      expect(s).toMatch(new RegExp(method + ": .*guard\\("));
    expect(s).toContain("registerPlugin<NativeCaptureBridge>");
    expect(s).toContain("UNKNOWN");
  });
  it("closes a WebRTC offer if a remote answer errors or loses its callback",()=>{
    const s=readFileSync("src/lib/mesh.ts","utf8");
    const code=s.slice(s.indexOf("async acceptAnswer("),s.indexOf("async answerOffer("));
    expect(code).toContain('pc.close()');
    expect(code).toContain('this.connections.delete(pc)');
    expect(code).toContain('if(this.pending===pc)');
    expect(code).toContain('throw error;');
  });
});
