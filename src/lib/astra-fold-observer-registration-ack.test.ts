import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("Astra OEM fold observer only acknowledges real registration",()=>{
 const code=readFileSync("android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java","utf8");
 it("retains pending callers until the background OEM subscription actually finishes",()=>{
   expect(code).toContain("registrationPending = true");
   expect(code).toContain("REGISTRATION_TIMEOUT_MS = 8000L");
   expect(code).toContain("registrationHandler.postDelayed(registrationWatchdog");
   expect(code).toContain("cancelRegistrationWatchdog()");
   expect(code).toContain("stopListener(); // Reject callers, preserve UNKNOWN fold safety.");
   expect(code).toContain("MAX_PENDING_REGISTRATION_CALLS = 24");
   expect(code).toContain('call.reject("Fold observer registration already pending for owner")');
   expect(code).toContain('call.reject("Fold registration has too many pending requests")');
   expect(code).toContain("registrationCalls.add(new PendingRegistration(ownerId, call))");
   expect(code).toContain("if (registrationPending)");
   expect(code).toContain("finishRegistrationCalls(null)");
   expect(code).toContain('finishRegistrationCalls("Fold observer stopped before registration")');
 });
 it("cancels only the stopped owner and never resolves a stale queued call",()=>{
   expect(code).toContain("ownerId.equals(waiting.ownerId)");
   expect(code).toContain("registrationCalls.remove(i)");
   expect(code).toContain("waiting.call.reject");
   expect(code).toContain("ownerGeneration != observerGeneration");
   expect(code).toContain("activeOwners.clear()");
 });
 it("preserves WindowManager layout callbacks and all recording safety observations",()=>{
   expect(code).toContain("registeringAdapter.addWindowLayoutInfoListener");
   expect(code).toContain("NativeCaptureService.observeFoldDuringRecording");
   expect(code).toContain("NativeCapturePlugin.onFoldGeometryChanged");
 });
});
