import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra: WindowManager Binder must never build an unbounded retry queue", () => {
  const source = readFileSync(
    "android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java", "utf8",
  );
  it("uses bounded workers with direct handoff instead of unbounded single-worker queue", () => {
    expect(source).toContain("new java.util.concurrent.ThreadPoolExecutor(");
    expect(source).toContain("new java.util.concurrent.SynchronousQueue<>()");
    expect(source).toContain("new java.util.concurrent.ThreadPoolExecutor.AbortPolicy()");
    expect(source).not.toContain("Executors.newSingleThreadExecutor(");
  });
  it("removes a late OEM listener after its timed-out generation has stopped", () => {
    expect(source).toContain("registrationAttemptRetired.set(true)");
    expect(source).toContain("if (retired.get()) {");
    expect(source).toContain("registeringAdapter.removeWindowLayoutInfoListener(registeringListener)");
    expect(source).toContain("REGISTRATION_TIMEOUT_MS = 8000L");
  });
  it("bounds both waiting bridge calls and emergency cleanup", () => {
    expect(source).toContain("MAX_PENDING_REGISTRATION_CALLS = 24");
    expect(source).toContain("fallbackCleanupBusy.compareAndSet(false, true)");
    expect(source).toContain("finally { fallbackCleanupBusy.set(false); }");
  });
});
