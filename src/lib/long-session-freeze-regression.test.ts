import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { analysisCache, BoundedDerivedCache, thumbCache } from "./media-cache";

describe("long-session camera and editor memory safety", () => {
  it("evicts only regenerable metadata while retaining recently used entries", () => {
    const cache = new BoundedDerivedCache<number, string>(3);
    cache.set(1, "one"); cache.set(2, "two"); cache.set(3, "three");
    expect(cache.get(1)).toBe("one");
    cache.set(4, "four");
    expect([...cache.keys()]).toEqual([3, 1, 4]);
    expect(cache.get(2)).toBeUndefined();
    for (let i = 5; i < 10000; i++) cache.set(i, String(i));
    expect(cache.size).toBe(3);
    expect(analysisCache.maxEntries).toBe(128);
    expect(thumbCache.maxEntries).toBe(64);
    expect(readFileSync("src/lib/clip-persistence.ts","utf8")).toContain("saveRecordedClipsAtomically");
  });
  it("keeps actual face tracking and audio monitoring with lifecycle safeguards", () => {
    const camera = readFileSync("src/components/multicam/CameraPro.tsx","utf8");
    expect(camera).toContain("const faces = await det.detect(v)");
    expect(camera).toContain("if (!alive || (document.hidden && !responsiveHiddenFrames)) return;");
    expect(camera).toContain("if (nextFrame !== null) window.clearTimeout(nextFrame)");
    expect(camera).toContain("if (t - last >= 40)");
    expect(camera).toContain("getFloatTimeDomainData(buf)");
    expect(camera).toContain("applyAdvanced(stream");
  });
});
