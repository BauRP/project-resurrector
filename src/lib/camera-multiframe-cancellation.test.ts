import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { grabFrames } from "@/components/multicam/CameraPro";

describe("photo capture cancellation on Camera2/WebView handoff", () => {
  it("returns before allocating a 4K buffer when the camera was already closed", async () => {
    const controller = new AbortController();
    controller.abort();
    const fakeVideo = { videoWidth: 3840, videoHeight: 2160 } as HTMLVideoElement;
    await expect(grabFrames(fakeVideo, "none", 40, 2000, controller.signal)).resolves.toBeNull();
  });
  it("cancels both accumulation and final averaged image writes without changing the quality path", () => {
    const code = readFileSync("src/components/multicam/CameraPro.tsx", "utf8");
    expect(code).toContain("if (signal?.aborted) return null");
    expect(code).toContain("signal?.removeEventListener(\"abort\", onAbort)");
    expect(code).toContain('c.toBlob(blob => finish(blob), "image/jpeg", 0.93)');
    expect(code).toContain("for (let k = 0; k < frames; k++)");
  });
  it("passes the same cancel signal to burst, bracket, night and long-exposure modes", () => {
    const code = readFileSync("src/components/multicam/CameraTab.tsx", "utf8");
    expect(code).toContain("const activePhoto = useRef<AbortController | null>(null)");
    expect(code).toContain("activePhoto.current?.abort()");
    expect(code).toContain("photoAbort.signal");
    expect(code).toContain("await grabFrames(v, previewFilter, 40, 2000, photoAbort.signal)");
    expect(code).toContain("if (photoAbort.signal.aborted) return");
  });
});
