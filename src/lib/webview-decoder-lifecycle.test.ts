import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("WebView video resource lifecycle, no feature removal", () => {
  it("subscribes to the timeline video metadata before starting its load", () => {
    const code = readFileSync("src/components/multicam/EditorVideoLayer.tsx", "utf8");
    expect(code.indexOf('v.addEventListener("loadedmetadata",onReady)')).toBeLessThan(code.indexOf("v.src=source;v.load();"));
    expect(code).toContain("v.removeEventListener");
    expect(code).toContain("v.play()");
    expect(code).toContain("v.currentTime=to");
  });

  it("cancels proxy metadata promptly when leaving the editor", () => {
    const code = readFileSync("src/lib/video-proxy.ts", "utf8");
    expect(code).toContain('signal.addEventListener("abort", onAbort, { once: true })');
    expect(code).toContain('signal.removeEventListener("abort", onAbort)');
    expect(code).toContain('finish(new Error("Proxy cancelled"))');
    expect(code).toContain("try { recorder.stop(); } catch");
    expect(code).toContain("void done.catch(() => undefined)");
    expect(code).toContain("canvas.captureStream(24)");
    expect(code).toContain("await writeProxy(id, blob, signal)");
  });
});
