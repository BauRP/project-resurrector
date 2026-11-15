import { afterEach, describe, expect, it, vi } from "vitest";
import { generateProxy } from "./video-proxy";

vi.mock("./media-cache", () => ({
  readProxy: vi.fn(async () => null),
  writeProxy: vi.fn(async () => undefined),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Android 9 proxy survives failed WebView compositor frames", () => {
  async function runBrokenProxy(kind: "canvas-failure" | "encoder-stopped") {
    const fields = ["videoWidth", "videoHeight", "duration", "readyState"] as const;
    const originals = fields.map(key =>
      [key, Object.getOwnPropertyDescriptor(HTMLVideoElement.prototype, key)] as const
    );
    const capture = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "captureStream");
    const trackStop = vi.fn();
    const recorderStop = vi.fn();

    class MockRecorder {
      static isTypeSupported() { return true; }
      state = "inactive";
      ondataavailable: ((event: BlobEvent) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() { this.state = "recording"; }
      stop() {
        this.state = "inactive";
        recorderStop();
        // Deliberately omit onstop to reproduce the broken OEM codec.
      }
    }

    try {
      for (const [key, value] of Object.entries({
        videoWidth: 1920, videoHeight: 1080, duration: 15, readyState: 2,
      })) {
        Object.defineProperty(HTMLVideoElement.prototype, key, {
          configurable: true, get: () => value,
        });
      }
      Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
        configurable: true,
        value: () => ({ getTracks: () => [{ stop: trackStop }] }),
      });
      vi.stubGlobal("MediaRecorder", MockRecorder);
      vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
      vi.stubGlobal("cancelAnimationFrame", vi.fn());
      vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
      vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
        queueMicrotask(() => this.dispatchEvent(new Event("loadeddata")));
      });
      vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
        if (kind === "encoder-stopped") {
          queueMicrotask(() => {
            const v = this as HTMLVideoElement;
            // Simulate Android MediaCodec silently changing to inactive.
            const recorder = createdRecorder;
            if (recorder) recorder.state = "inactive";
            v.dispatchEvent(new Event("ended"));
          });
        }
        return Promise.resolve();
      });
      vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({
        drawImage: kind === "canvas-failure"
          ? () => { throw new DOMException("GPU context lost", "InvalidStateError"); }
          : () => undefined,
      }) as unknown as CanvasRenderingContext2D);

      // The mock constructor keeps a reference to inspect the unexpected end.
      const originalCtor = MockRecorder;
      let createdRecorder: MockRecorder | null = null;
      class RecordingConstructor extends originalCtor {
        constructor(...args: any[]) {
          super();
          createdRecorder = this;
        }
      }
      vi.stubGlobal("MediaRecorder", RecordingConstructor);

      const controller = new AbortController();
      const promise = generateProxy("stalled-preview", "blob:original-recording", controller.signal);
      await expect(promise).rejects.toThrow(kind === "canvas-failure"
        ? "Proxy decoder failed to provide a frame"
        : "Proxy encoder ended without a completed recording");
      expect(recorderStop).toHaveBeenCalledTimes(kind === "canvas-failure" ? 1 : 0);
      expect(trackStop).toHaveBeenCalledTimes(1);
      expect(controller.signal.aborted).toBe(false);
    } finally {
      for (const [key, descriptor] of originals) {
        if (descriptor) Object.defineProperty(HTMLVideoElement.prototype, key, descriptor);
        else Reflect.deleteProperty(HTMLVideoElement.prototype, key);
      }
      if (capture) Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", capture);
      else Reflect.deleteProperty(HTMLCanvasElement.prototype, "captureStream");
    }
  }

  it("releases the optional decoder/encoder immediately when canvas loses a frame", async () => {
    await runBrokenProxy("canvas-failure");
  });

  it("does not wait for a missing onstop when the video ends with an inactive recorder", async () => {
    await runBrokenProxy("encoder-stopped");
  });
});
