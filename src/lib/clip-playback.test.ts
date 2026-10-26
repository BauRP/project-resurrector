import { describe, expect, it } from "vitest";
import { assessSavedVideoDuration, isDecodedFirstFrame, summarizePresentedFrames } from "./clip-playback";

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


describe("conservative saved video duration evidence", () => {
  it("rejects unknown, negative and implausible timestamps", () => {
    expect(assessSavedVideoDuration(null, 40).status).toBe("unknown");
    expect(assessSavedVideoDuration(30000, Number.NaN).status).toBe("unknown");
    expect(assessSavedVideoDuration(-1, 1).status).toBe("unknown");
    expect(assessSavedVideoDuration(2000, 2).status).toBe("unknown");
  });
  it("detects a substantially shortened encoded file", () => {
    const evidence=assessSavedVideoDuration(60000, 12);
    expect(evidence.status).toBe("short");
    expect(evidence.message).toContain("короче");
  });
  it("never infers all-frame integrity from a consistent file duration", () => {
    const evidence=assessSavedVideoDuration(60000, 59);
    expect(evidence.status).toBe("consistent");
    expect(evidence.message).toContain("не выполнена");
  });
  it("avoids a false success for abnormal time-lapse-like duration", () => {
    expect(assessSavedVideoDuration(12000, 60).status).toBe("unknown");
  });
});
