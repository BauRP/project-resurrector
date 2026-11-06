import { describe, expect, it, vi } from "vitest";
import { generateProxy } from "./video-proxy";

vi.mock("./media-cache", () => ({
  readProxy: vi.fn(async () => null),
  writeProxy: vi.fn(async () => undefined),
}));

describe("Android proxy encoder missing MediaRecorder.onstop", () => {
  it("releases a cancelled editor decoder even if the codec never sends onstop", async () => {
    let started!: () => void;
    const encoderStarted = new Promise<void>(resolve => { started = resolve; });
    const stop = vi.fn();
    class StuckRecorder {
      static isTypeSupported(_format: string) { return true; }
      state = "inactive";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() { this.state = "recording"; started(); }
      stop() { this.state = "inactive"; stop(); /* OEM never sends onstop */ }
    }

    const videoProps = ["videoWidth", "videoHeight", "duration", "readyState"] as const;
    const original = videoProps.map(key =>
      [key, Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, key)] as const);
    const capture = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "captureStream");
    try {
      for (const [key, value] of Object.entries({videoWidth:1920,videoHeight:1080,duration:6,readyState:2}))
        Object.defineProperty(HTMLVideoElement.prototype, key, {configurable:true,get:()=>value});
      Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
        configurable:true,
        value: () => ({ getTracks: () => [{ stop: vi.fn() }] }),
      });
      vi.stubGlobal("MediaRecorder", StuckRecorder);
      vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
      vi.stubGlobal("cancelAnimationFrame", vi.fn());
      vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
      vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function(this: HTMLMediaElement) {
        queueMicrotask(() => this.dispatchEvent(new Event("loadeddata")));
      });
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
        () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D
      );
      const controller = new AbortController();
      const proxy = generateProxy("video-1", "blob:original-video", controller.signal);
      await Promise.race([encoderStarted, new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error("Proxy never started")), 1500))]);
      controller.abort();
      await expect(proxy).rejects.toThrow("Proxy cancelled");
      expect(stop).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      for (const [key, descriptor] of original) {
        if (descriptor) Object.defineProperty(HTMLVideoElement.prototype, key, descriptor);
        else Reflect.deleteProperty(HTMLVideoElement.prototype, key);
      }
      if (capture) Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", capture);
      else Reflect.deleteProperty(HTMLCanvasElement.prototype, "captureStream");
    }
  });
});
