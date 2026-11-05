import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { hasPendingAuxiliaryCameraOpen, openAuxiliaryCamera } from "./auxiliary-camera-open-guard";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("WebView auxiliary camera timeout must not start another concurrent OEM open", () => {
  it("keeps its native-driver opening lease even after a JavaScript timeout", async () => {
    vi.useFakeTimers();
    let finish!: (stream: MediaStream) => void;
    const stop = vi.fn();
    const gum = vi.fn(() => new Promise<MediaStream>(resolve => { finish = resolve; }));
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: gum } });
    const timedOut = openAuxiliaryCamera({ video: true }, 7000, "Second camera");
    const rejected = expect(timedOut).rejects.toThrow("Second camera: timeout");
    await vi.advanceTimersByTimeAsync(7010);
    await rejected;
    expect(hasPendingAuxiliaryCameraOpen()).toBe(true);
    await expect(openAuxiliaryCamera({ video: true }, 7000, "Second camera")).rejects.toThrow("всё ещё выполняется");
    expect(gum).toHaveBeenCalledTimes(1);
    finish({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await vi.advanceTimersByTimeAsync(0);
    expect(stop).toHaveBeenCalledOnce();
    expect(hasPendingAuxiliaryCameraOpen()).toBe(false);
    const third = openAuxiliaryCamera({ video: true }, 7000, "Second camera");
    await vi.advanceTimersByTimeAsync(0);
    expect(gum).toHaveBeenCalledTimes(2);
    finish({ getTracks: () => [{ stop }] } as unknown as MediaStream);
    await third;
  });

  it("uses the shared gate from both real auxiliary preview and two-camera verification", () => {
    const preview = readFileSync("src/components/multicam/DualCameraPreview.tsx","utf8");
    const check = readFileSync("src/lib/dual-camera-verification.ts","utf8");
    expect(preview).toContain("openAuxiliaryCamera({");
    expect(preview).not.toContain("navigator.mediaDevices.getUserMedia(");
    expect(check).toContain("openAuxiliaryCamera(constraints(firstId), 7000");
    expect(check).toContain("openAuxiliaryCamera(constraints(secondId), 7000");
    expect(check).not.toContain("navigator.mediaDevices.getUserMedia(");
  });
});
