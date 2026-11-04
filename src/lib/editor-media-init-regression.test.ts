import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("media events cannot race cached Android WebView loading", () => {
  it("registers loadeddata and error handlers before thumbnail src", () => {
    const src = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    const body = src.slice(src.indexOf("async function makeThumbs("), src.indexOf("async function analyse("));
    expect(body.indexOf('v.addEventListener("loadeddata", finish)')).toBeLessThan(body.indexOf("v.src = url;"));
    expect(body.indexOf('v.addEventListener("error", finish)')).toBeLessThan(body.indexOf("v.src = url;"));
    expect(body).toContain('signal?.addEventListener("abort", finish');
    expect(body).toContain("v.load()");
  });
  it("registers video metadata callbacks before clip src", () => {
    const src = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    const body = src.slice(src.indexOf("async function analyse("), src.indexOf("export function EditorPro("));
    expect(body.indexOf("v.onloadedmetadata =")).toBeLessThan(body.indexOf("v.src = url;"));
    expect(body.indexOf("v.onerror =")).toBeLessThan(body.indexOf("v.src = url;"));
    expect(body).toContain("decodeAudioData(");
  });
  it("preserves the proxy renderer and installs listeners before loading", () => {
    const src = readFileSync("src/lib/video-proxy.ts", "utf8");
    expect(src.indexOf("video.onloadeddata =")).toBeLessThan(src.indexOf("video.src = source;"));
    expect(src).toContain("canvas.captureStream(24)");
    expect(src).toContain("await writeProxy(id, blob, signal)");
  });
});
