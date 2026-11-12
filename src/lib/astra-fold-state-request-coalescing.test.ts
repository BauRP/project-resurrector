import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra repeated fold geometry requests cannot flood Android MAIN",()=>{
  const code=readFileSync("android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java","utf8");
  it("coalesces concurrent getState retries into one measurement",()=>{
    expect(code).toContain("private final ArrayList<PluginCall> pendingStateReads");
    expect(code).toContain("MAX_PENDING_STATE_READS = 24");
    expect(code).toContain("schedule = !overflow && !stateReadScheduled");
    expect(code).toContain("if (!schedule) return");
    expect(code).toContain("host.runOnUiThread(() -> {");
    expect(code).toContain("completeStateReads(snapshot(), null)");
  });
  it("does not hold the pending-call lock during expensive View or OEM operations",()=>{
    const fn=code.slice(code.indexOf("private void completeStateReads"),
       code.indexOf("@PluginMethod\n    public void startObserving"));
    expect(fn).toContain("synchronized (stateReadLock)");
    expect(fn).not.toContain("synchronized (stateReadLock) {\n            completeStateReads(snapshot()");
    expect(fn).toContain("waitingCall.resolve(state)");
    expect(fn).toContain("waitingCall.reject(error)");
  });
  it("fails queued calls on Activity teardown without erasing fold detection",()=>{
    expect(code).toContain('completeStateReads(null, "Fold Activity destroyed")');
    expect(code).toContain("NativeCaptureService.observeFoldDuringRecording");
    expect(code).toContain("registrationWorker.execute(() -> {");
    expect(code).toContain("notifyListeners(\"topologyChanged\"");
  });
});
