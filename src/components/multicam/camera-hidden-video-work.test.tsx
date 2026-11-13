import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRef } from "react";
import { readFileSync } from "node:fs";
import { useFaceTracking } from "./CameraPro";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Astra: video analysis stays responsive through Android background transitions", () => {
  it("stops FaceDetector while hidden, resumes once visible, and cleans up on exit", async () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    const detect = vi.fn().mockResolvedValue([]);
    vi.stubGlobal("FaceDetector", class { detect = detect; });
    const stream = { getVideoTracks: () => [{ readyState: "live", getCapabilities: () => ({}) }] } as unknown as MediaStream;
    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(video);
      return useFaceTracking(ref, stream, true, false);
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(380); });
    expect(detect.mock.calls.length).toBeGreaterThanOrEqual(2);
    const n = detect.mock.calls.length;
    hidden = true;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(detect).toHaveBeenCalledTimes(n);
    hidden = false;
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(detect.mock.calls.length).toBeGreaterThan(n);
    const afterReturn = detect.mock.calls.length;
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(detect).toHaveBeenCalledTimes(afterReturn);
  });
  it("does not overlap a slow FaceDetector across a background/foreground cycle", async () => {
    vi.useFakeTimers();
    let hidden = false;
    vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
    let resolve!: (faces: []) => void;
    const detect = vi.fn(() => new Promise<[]>(r => { resolve = r; }));
    vi.stubGlobal("FaceDetector", class { detect = detect; });
    const stream = { getVideoTracks: () => [{ readyState: "live", getCapabilities: () => ({}) }] } as unknown as MediaStream;
    const video = { videoWidth: 640, videoHeight: 480 } as HTMLVideoElement;
    const { unmount } = renderHook(() => {
      const ref = useRef<HTMLVideoElement | null>(video);
      return useFaceTracking(ref, stream, true, false);
    });
    expect(detect).toHaveBeenCalledOnce();
    hidden = true;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    hidden = false;
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(detect).toHaveBeenCalledOnce();
    await act(async () => {
      resolve([]);
      await vi.advanceTimersByTimeAsync(130);
    });
    expect(detect).toHaveBeenCalledTimes(2);
    unmount();
  });
  it("preserves false-color overlay but skips hidden GPU readback", () => {
    const source = readFileSync("src/components/multicam/CameraPro.tsx", "utf8");
    const overlay = source.slice(source.indexOf("export function FalseColorOverlay"), source.indexOf("/* ---------- Vertical VU meter"));
    expect(overlay).toContain("if (document.hidden || t - last < 66) return;");
    expect(overlay).toContain("v.readyState < 2");
    expect(overlay).toContain("ctx.drawImage(v, 0, 0, w, h)");
    expect(overlay).toContain("catch { /* Retired camera surface:");
    expect(overlay).toContain("return () => cancelAnimationFrame(raf)");
    expect(source).not.toContain(".finally(() => { focusBusy = false; })");
  });
});
