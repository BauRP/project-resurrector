import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { selectEditorClipDuration } from "./editor-media-duration";

describe("recorded WebM duration on Android 9 WebView 69 and long-form media", () => {
  it("prioritizes the real decoded duration when it exists", () => {
    expect(selectEditorClipDuration(16,15)).toBe(16);
    expect(selectEditorClipDuration(7200,3600)).toBe(7200);
  });
  it("recovers Infinity using reliable saved recording duration", () => {
    expect(selectEditorClipDuration(Infinity,15)).toBe(15);
    expect(selectEditorClipDuration(Infinity,1800)).toBe(1800);
    expect(selectEditorClipDuration(Infinity,3600)).toBe(3600);
    expect(selectEditorClipDuration(Infinity,7200)).toBe(7200);
  });
  it("recovers an unknown duration only from a completed seek or seekable end", () => {
    expect(selectEditorClipDuration(Infinity,undefined,25)).toBe(25);
    expect(selectEditorClipDuration(Infinity,undefined,undefined,14.99)).toBe(14.99);
    expect(selectEditorClipDuration(Infinity,undefined,undefined,Infinity)).toBeNull();
    expect(selectEditorClipDuration(Infinity)).toBeNull();
    expect(selectEditorClipDuration(NaN,-1,Infinity,1e7)).toBeNull();
    expect(selectEditorClipDuration(0,undefined,undefined,0)).toBeNull();
  });
  it("keeps the original source blob and cancels the temporary metadata decoder", () => {
    const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
    expect(editor).toContain("selectEditorClipDuration(v.duration, clip.duration)");
    expect(editor).toContain("v.onseeked = () => reportDuration(true)");
    expect(editor).toContain("v.ondurationchange = () => reportDuration(true)");
    expect(editor).toContain("v.onseeked = null; v.ondurationchange = null");
    expect(editor).toContain("const url = URL.createObjectURL(clip.blob)");
  });
});
