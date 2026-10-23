import { describe, expect, it } from "vitest";
import { isDecodedFirstFrame, summarizePresentedFrames } from "./clip-playback";

describe("decoded video proof", () => {
  it("never accepts loaded metadata alone", () => {
    expect(isDecodedFirstFrame(1, 1920, 1080)).toBe(false);
    expect(isDecodedFirstFrame(0, 1920, 1080)).toBe(false);
  });
  it("requires a real positive decoded image size", () => {
    expect(isDecodedFirstFrame(2, 1920, 1080)).toBe(true);
    expect(isDecodedFirstFrame(4, 1280, 720)).toBe(true);
    expect(isDecodedFirstFrame(2, 0, 1080)).toBe(false);
    expect(isDecodedFirstFrame(3, Number.NaN, 1080)).toBe(false);
    expect(isDecodedFirstFrame(3, 1920, -10)).toBe(false);
  });
});

describe("real presentation frame sampling", () => {
  it("never invents an FPS value from too few frames", () => {
    expect(summarizePresentedFrames([{presentationTimeMs:0,presentedFrames:1}]).approximateFps).toBe(null);
  });
  it("computes an explicitly approximate presentation FPS with a sufficient sample", () => {
    const values = [0,250,500,750,1000].map((time,i)=>({presentationTimeMs:time,presentedFrames:i*8}));
    const output = summarizePresentedFrames(values);
    expect(output.approximateFps).toBe(32);
    expect(output.status).toBe("sampled");
    expect(output.limitation).toContain("не частота кадров кодека");
  });
});
