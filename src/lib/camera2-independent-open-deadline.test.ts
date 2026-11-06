import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const service = readFileSync("android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java", "utf8");

describe("Camera2 open deadline is independent of a blocked camera driver", () => {
  it("starts an independent Android Looper and schedules both recording and preview deadlines there", () => {
    expect(service).toContain('new HandlerThread("Native-Camera2-OpenDeadline")');
    expect(service).toContain("openDeadlineThread.start()");
    expect(service).toContain("openDeadlineHandler = new Handler(openDeadlineThread.getLooper())");
    expect(service).toContain("openDeadlineHandler.postDelayed(openingTimeout, 12000L)");
    expect(service).toContain("openDeadlineHandler.postDelayed(openingTimeout,12000)");
    expect(service).not.toContain("worker.postDelayed(openingTimeout");
  });
  it("signals a real failure without closing the media recorder concurrently with its owner", () => {
    const block = service.slice(service.indexOf("private void onOpenDeadline("), service.indexOf("private void fail(", service.indexOf("private void onOpenDeadline(")));
    expect(block).toContain("session != generation || stopRequested || finalizationStarted.get()");
    expect(block).toContain("stopRequested = true");
    expect(block).toContain('publish("error", reason)');
    expect(block).toContain("worker.post(this::finish)");
    expect(block).not.toContain("releaseCamera()");
    expect(block).not.toContain("encoder.stop()");
  });
  it("removes deadline callbacks from the correct Looper and shuts it down with the service", () => {
    expect(service).toContain("openDeadlineHandler.removeCallbacks(openingTimeout)");
    expect(service).toContain("openDeadlineThread.quitSafely()");
    expect(service).not.toContain("worker.removeCallbacks(openingTimeout)");
  });
});
