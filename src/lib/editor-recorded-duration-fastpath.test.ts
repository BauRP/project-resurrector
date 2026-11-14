import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { selectEditorClipDuration } from "./editor-media-duration";

describe("lazy Editor metadata on Android 9 and multi-hour WebM", () => {
  const code = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
  it("does not start a second video decoder for WebM with saved duration", () => {
    const lookup=code.indexOf('const recorded = clip.blob.type.startsWith("video/webm")');
    const mount=code.indexOf('const v = document.createElement("video"); v.preload = "metadata";');
    expect(lookup).toBeGreaterThan(0);
    expect(lookup).toBeLessThan(mount);
    expect(code).toContain("if (recorded !== null) {");
    expect(code).toContain("analysisCache.set(clip.id, { duration: recorded, peaks });");
  });
  it("continues real metadata probing when source duration is missing or invalid", () => {
    for (const invalid of [undefined, NaN, Infinity, 0, -1, 86401]) {
      expect(selectEditorClipDuration(NaN, invalid)).toBeNull();
    }
    expect(code).toContain('v.onloadedmetadata = () => {');
  });
  it("retains full duration with the unchanged original even for two-hour media", () => {
    for (const seconds of [15, 1800, 3600, 7200]) {
      expect(selectEditorClipDuration(NaN, seconds)).toBe(seconds);
    }
    expect(code).toContain("const url = URL.createObjectURL(clip.blob);");
    expect(code).toContain("analysisCache.set(clip.id, { duration: recorded, peaks });");
    expect(code).toContain("const peaks: number[] = [];");
  });
});
