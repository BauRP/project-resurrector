import { describe, expect, it } from "vitest";
import { planVideoCheckpoints, summarizeVideoCheckpoints, checkpointFrameMatches } from "./clip-checkpoints";

describe("bounded decoded checkpoint plan", () => {
  it("does not fabricate timestamps for unknown or very short clips", () => {
    for (const duration of [null,undefined,0,4,Number.NaN,Infinity,90000])
      expect(planVideoCheckpoints(duration)).toEqual([]);
  });
  it("samples actual middle and near-end points, not metadata-only", () => {
    expect(planVideoCheckpoints(60)).toEqual([27,51]);
    expect(planVideoCheckpoints(20)).toEqual([9,17]);
  });
  it("requires every requested frame to be observed without certifying the full file", () => {
    expect(summarizeVideoCheckpoints(2,2)).toMatchObject({status:"sampled",observed:2});
    expect(summarizeVideoCheckpoints(2,1).status).toBe("unavailable");
    expect(summarizeVideoCheckpoints(0,0).status).toBe("unavailable");
    expect(summarizeVideoCheckpoints(2,2).message).toContain("полная целостность");
  });
});


describe("actual decoded checkpoint frame matching", () => {
  it("rejects unrelated frames immediately after a seek", () => {
    expect(checkpointFrameMatches(1,51,3,1920,1080)).toBe(false);
    expect(checkpointFrameMatches(51.2,51,3,1920,1080)).toBe(true);
    expect(checkpointFrameMatches(51,51,1,1920,1080)).toBe(false);
    expect(checkpointFrameMatches(51,51,3,0,1080)).toBe(false);
    expect(checkpointFrameMatches(Number.NaN,51,3,1920,1080)).toBe(false);
  });
});
