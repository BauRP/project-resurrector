import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Android WebView thumbnail seek/renderer failures", () => {
  const editor = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
  const start = editor.indexOf("async function makeThumbs(");
  const end = editor.indexOf("async function analyse(", start);
  const thumbs = editor.slice(start, end);

  it("does not encode stale frames after a timed-out video seek", () => {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(thumbs).toContain("const seeked = await new Promise<boolean>");
    expect(thumbs).toContain('v.addEventListener("seeked", onSeeked)');
    expect(thumbs).toContain("const timer = window.setTimeout(() => finish(), 1500)");
    expect(thumbs).toContain("if (!seeked) break");
  });

  it("preserves earlier valid thumbnails when canvas/GPU compositing fails", () => {
    const begin = thumbs.indexOf("if (!seeked) break");
    const safeDraw = thumbs.indexOf("try {", begin);
    const draw = thumbs.indexOf("ctx.drawImage(", safeDraw);
    const encode = thumbs.indexOf('c.toDataURL("image/jpeg", 0.6)', draw);
    const fallback = thumbs.indexOf("} catch {", encode);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(safeDraw).toBeGreaterThan(begin);
    expect(draw).toBeGreaterThan(safeDraw);
    expect(encode).toBeGreaterThan(draw);
    expect(fallback).toBeGreaterThan(encode);
    expect(thumbs.slice(fallback, fallback + 150)).toContain("break;");
  });

  it("aborts on navigation and releases the media decoder without changing original clips", () => {
    expect(thumbs).toContain("signal?.addEventListener(\"abort\", onAbort, { once: true })");
    expect(thumbs).toContain("if (signal?.aborted) return []");
    expect(thumbs).toContain('v.removeAttribute("src")');
    expect(thumbs).toContain("v.pause()");
    expect(thumbs).toContain("v.load()");
    expect(thumbs).not.toContain("deleteClip");
  });
});
