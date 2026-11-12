import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra Android display topology thread safety", () => {
  const java=readFileSync("android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java","utf8");
  it("runs geometry measurements on Android UI rather than CapacitorPlugins worker",()=>{
    expect(java).toContain("activity.runOnUiThread(safe)");
    expect(java).toContain("Looper.myLooper() == Looper.getMainLooper()");
    expect(java).toContain("onUiThread(call, () -> call.resolve(snapshot()))");
    expect(java).toContain("onUiThread(call, () -> startObservingOnUi(call))");
    expect(java).toContain("onUiThread(call, () -> stopObservingOnUi(call))");
    expect(java).toContain("root.getLocationInWindow");
    expect(java).toContain("ViewCompat.getRootWindowInsets");
  });
  it("does not lock an instance monitor across OEM WindowManager add/remove",()=>{
    expect(java).not.toContain("synchronized void startObserving");
    expect(java).not.toContain("synchronized void stopObserving");
    expect(java).not.toContain("synchronized void stopListener");
    expect(java).not.toContain("synchronized JSObject snapshot");
    expect(java).not.toContain("synchronized (DisplayTopologyPlugin.this)");
    expect(java).toContain("registeringAdapter.addWindowLayoutInfoListener(host, main, registeringListener)");
    expect(java).toContain("registrationWorker.execute(() -> {");
    expect(java).toContain("removingAdapter.removeWindowLayoutInfoListener(removingListener)");
  });
  it("keeps genuine folds, geometry ownership and direct preview safety",()=>{
    for(const required of ["surfaceHinges","isUnsafeDirectPreviewWindowRect",
       "NativeCaptureService.observeFoldDuringRecording","NativeCapturePlugin.onFoldGeometryChanged",
       "activeOwners","observerGeneration","observerLease",
       "WindowInfoTracker.getOrCreate(host)"])expect(java).toContain(required);
  });
});
