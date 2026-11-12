import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra Android fold Binder wait is bounded", () => {
  const java = readFileSync("android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java","utf8");
  it("bounds stalled OEM registration and rejects pending callers", () => {
    expect(java).toContain("REGISTRATION_TIMEOUT_MS = 8000L");
    expect(java).toContain("registrationHandler.postDelayed(registrationWatchdog");
    expect(java).toContain("activeOwners.clear();");
    expect(java).toContain("stopListener(); // Reject callers, preserve UNKNOWN fold safety.");
    expect(java).toContain('finishRegistrationCalls("Fold observer stopped before registration")');
  });
  it("cancels stale registration timers on completion or Activity teardown", () => {
    expect(java).toContain("cancelRegistrationWatchdog();");
    expect(java).toContain("registrationHandler.removeCallbacks(registrationWatchdog)");
    expect(java).toContain("registrationWorker.shutdown()");
    expect(java).toContain("ownerGeneration == observerGeneration");
    expect(java).toContain("listener == registeringListener");
  });
  it("retains true fold and native recording observations",()=>{
    expect(java).toContain("registeringAdapter.addWindowLayoutInfoListener(host, main, registeringListener)");
    expect(java).toContain("NativeCaptureService.observeFoldDuringRecording");
    expect(java).toContain("armSurfaceLease(lease)");
  });
});
