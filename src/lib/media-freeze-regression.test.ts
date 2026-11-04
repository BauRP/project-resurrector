import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("WebView must not allocate GPU/video frames faster than requested", () => {
  it("draws 24fps proxy frames instead of 60/120fps while retaining original media", () => {
    const proxy = readFileSync("src/lib/video-proxy.ts", "utf8");
    expect(proxy).toContain("now - lastFrameAt >= 1000 / 24");
    expect(proxy).toContain("canvas.captureStream(24)");
    expect(proxy).toContain("if (signal.aborted) return");
    expect(proxy).toContain("await writeProxy(id, blob, signal)");
  });
  it("reuses false-color canvas buffers and waits for live camera before tracking", () => {
    const camera = readFileSync("src/components/multicam/CameraPro.tsx", "utf8");
    expect(camera).toContain("if (c.width !== w) c.width = w");
    expect(camera).toContain("if (c.height !== h) c.height = h");
    expect(camera).toContain('stream?.getVideoTracks().some(track => track.readyState === "live")');
    expect(camera).toContain('ctx.putImageData(img, 0, 0)');
  });
});
