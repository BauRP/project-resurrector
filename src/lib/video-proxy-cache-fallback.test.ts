import { afterEach, describe, expect, it, vi } from "vitest";
import { generateProxy } from "./video-proxy";
import { readProxy, writeProxy } from "./media-cache";

vi.mock("./media-cache", () => ({
  readProxy: vi.fn(async () => null),
  writeProxy: vi.fn(async () => undefined),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(readProxy).mockReset().mockResolvedValue(null);
  vi.mocked(writeProxy).mockReset().mockResolvedValue(undefined);
});

describe("optional preview cache failure never disables Editor video", () => {
  it("continues to the decoder when the disposable cache is locked", async () => {
    vi.mocked(readProxy).mockRejectedValueOnce(new Error("IDB blocked"));
    vi.stubGlobal("MediaRecorder", undefined);
    await expect(generateProxy("clip", "blob:original", new AbortController().signal)).resolves.toBeNull();
    expect(readProxy).toHaveBeenCalledOnce();
    expect(writeProxy).not.toHaveBeenCalled();
  });

  it("does not start decoder after navigation aborts while cache is failing", async () => {
    const controller = new AbortController();
    vi.mocked(readProxy).mockImplementationOnce(async () => {
      controller.abort();
      throw new Error("IDB aborted");
    });
    const constructor = vi.fn();
    vi.stubGlobal("MediaRecorder", constructor);
    await expect(generateProxy("clip", "blob:original", controller.signal)).resolves.toBeNull();
    expect(constructor).not.toHaveBeenCalled();
  });

  it("returns an already cached Blob without unnecessary second decoder", async () => {
    const clip = new Blob(["preview"], { type: "video/webm" });
    vi.mocked(readProxy).mockResolvedValueOnce(clip);
    const constructor = vi.fn();
    vi.stubGlobal("MediaRecorder", constructor);
    await expect(generateProxy("clip", "blob:original", new AbortController().signal)).resolves.toBe(clip);
    expect(writeProxy).not.toHaveBeenCalled();
  });

  async function brokenWritePath() {
    const original = ["videoWidth", "videoHeight", "duration", "readyState"] as const;
    const descriptors = original.map(key => [key, Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, key)] as const);
    const captureDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "captureStream");
    const finishedBlob = new Blob(["fully-encoded"], { type: "video/webm" });
    const trackStop = vi.fn();
    class Recorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: finishedBlob });
        this.onstop?.();
      }
    }
    try {
      for (const [key, value] of Object.entries({ videoWidth: 1920, videoHeight: 1080, duration: 1, readyState: 2 }))
        Object.defineProperty(HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
      Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
        configurable: true, value: () => ({ getTracks: () => [{ stop: trackStop }] }),
      });
      vi.stubGlobal("MediaRecorder", Recorder);
      vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
      vi.stubGlobal("cancelAnimationFrame", vi.fn());
      vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
      vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
        queueMicrotask(() => this.dispatchEvent(new Event("loadeddata")));
      });
      vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
        queueMicrotask(() => this.dispatchEvent(new Event("ended")));
        return Promise.resolve();
      });
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D
      );
      vi.mocked(writeProxy).mockRejectedValueOnce(new Error("Cache quota exceeded"));
      const controller = new AbortController();
      const result = await generateProxy("clip", "blob:original", controller.signal);
      expect(result?.size).toBe(finishedBlob.size);
      expect(writeProxy).toHaveBeenCalledOnce();
      expect(trackStop).toHaveBeenCalledOnce();
      expect(controller.signal.aborted).toBe(false);
    } finally {
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(HTMLVideoElement.prototype, key, descriptor);
        else Reflect.deleteProperty(HTMLVideoElement.prototype, key);
      }
      if (captureDescriptor) Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", captureDescriptor);
      else Reflect.deleteProperty(HTMLCanvasElement.prototype, "captureStream");
    }
  }
  it("retains the completed 480p preview when cache persistence runs out of storage", brokenWritePath);
});
