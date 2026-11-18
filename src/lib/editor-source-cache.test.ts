import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { editorSourceKey, readCurrentEditorAnalysis } from "./editor-source-cache";

const clip = (size: number, createdAt = 100) => ({
  id: "same-clip", createdAt, kind: "video",
  name: "recording.mp4", camera: 1, duration: 15,
  blob: new Blob(["x".repeat(size)], { type: "video/mp4" }),
});

describe("Editor cached waveform, duration and thumbnails follow the original recording", () => {
  it("keeps valid analysis across remounts with a new Blob for the same original", () => {
    const old = clip(10);
    const loadedAgain = clip(10);
    expect(editorSourceKey(old)).toBe(editorSourceKey(loadedAgain));
    const key = editorSourceKey(old);
    const analysis = new Map([["same-clip", { duration: 15, peaks: [0.4], sourceKey: key }]]);
    const thumbnails = new Map([["same-clip", ["frame0"]]]);
    expect(readCurrentEditorAnalysis("same-clip", editorSourceKey(loadedAgain), analysis, thumbnails))
      .toEqual({ duration: 15, peaks: [0.4], sourceKey: key });
    expect(thumbnails.has("same-clip")).toBe(true);
  });

  it("invalidates old PCM peaks, duration and thumbnail frames when same id now has different media", () => {
    const oldKey = editorSourceKey(clip(10));
    const newKey = editorSourceKey(clip(12, 200));
    expect(newKey).not.toBe(oldKey);
    const analysis = new Map([["same-clip", { duration: 15, peaks: [0.8], sourceKey: oldKey }]]);
    const thumbnails = new Map([["same-clip", ["stale-frame"]]]);
    expect(readCurrentEditorAnalysis("same-clip", newKey, analysis, thumbnails)).toBeUndefined();
    expect(analysis.size).toBe(0);
    expect(thumbnails.size).toBe(0);
  });

  it("invalidates cache made by older application versions without a source identity", () => {
    const analysis = new Map([["same-clip", { duration: 15, peaks: [0.2] }]]);
    const thumbnails = new Map([["same-clip", ["old-frame"]]]);
    expect(readCurrentEditorAnalysis("same-clip", editorSourceKey(clip(10)), analysis, thumbnails))
      .toBeUndefined();
    expect(thumbnails.size).toBe(0);
  });

  it("includes non-byte clip metadata that can change decode behavior", () => {
    const original = clip(6);
    expect(editorSourceKey({ ...original, playbackRate: 2 }))
      .not.toBe(editorSourceKey(original));
    expect(editorSourceKey({ ...original, duration: 19 }))
      .not.toBe(editorSourceKey(original));
  });

  it("wires identity to all Editor derived cache paths, never to original clip deletion", () => {
    const code = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(code).toContain("readCurrentEditorAnalysis(clip.id, sourceKey, analysisCache, thumbCache)");
    expect(code).toContain("analysisCache.set(m.id, { duration: m.duration, peaks, sourceKey: m.sourceKey })");
    expect(code).toContain("generateProxy(`\${m.id}:\${m.sourceKey}`, m.url, attemptSignal)");
    expect(code).toContain("media.map(m => [m.id, m.url, m.kind, m.duration, m.sourceKey])");
    expect(code).not.toContain("URL.revokeObjectURL(handle.sourceUrl)");
  });
});
