import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("CameraManager availability callbacks must not stall Android navigation", () => {
  const native = readFileSync("android/app/src/main/java/app/lovable/multicampov/MultiCamNativePlugin.java","utf8");

  it("registers and unregisters CameraManager listeners on a dedicated worker", () => {
    expect(native).toContain("multicam-availability-control");
    expect(native).toContain("availabilityWorker.execute(() -> {");
    expect(native).toContain("cameras().registerAvailabilityCallback(watcher, availabilityCallbackHandler)");
    expect(native).toContain("cameras().unregisterAvailabilityCallback(availabilityWatcher)");
    expect(native).toContain("availabilityWorker.shutdown()");
    expect(native).not.toContain("availabilityMainHandler");
  });

  it("sends asynchronous camera availability callbacks on a native handler thread", () => {
    expect(native).toContain('new HandlerThread("multicam-availability-events")');
    expect(native).toContain("availabilityCallbackThread.start()");
    expect(native).toContain("new Handler(availabilityCallbackThread.getLooper())");
    expect(native).toContain("availabilityCallbackThread.quitSafely()");
  });

  it("preserves the owner reference count and late cleanup rules", () => {
    expect(native).toContain("availabilityOwners.add(ownerId)");
    expect(native).toContain("availabilityOwners.remove(ownerId)");
    expect(native).toContain("if (availabilityOwners.isEmpty()) stopAvailability()");
    expect(native).toContain('notifyListeners("cameraAvailabilityChanged", ev)');
    expect(native).toContain("availabilityWorker.execute(this::stopAvailability)");
  });
});

describe("Settings Android 9 first-paint without staggered controls", () => {
 const settings = readFileSync("src/components/multicam/SettingsTab.tsx","utf8");
 it("mounts all lightweight groups immediately while heavy Camera2 tools stay click-only",()=>{
   expect(settings).toContain('useState(() => !Capacitor.isNativePlatform())');
   const theme=settings.indexOf('title={tc.theme}');
   const language=settings.indexOf('title={t.language}');
   const camera=settings.indexOf('<section className="settings-advanced-tools"');
   expect(theme).toBeGreaterThan(0);
   expect(language).toBeGreaterThan(theme);
   expect(camera).toBeGreaterThan(language);
   expect(settings).not.toContain('{readyBody && <>');
   expect(settings).not.toContain('{readyAdvanced && <section');
   for(const tool of ['title={t.network}','title={t.storage}','title={t.engine}','<CameraDiagnostics />','<NativeRecordingPanel previewIntervalMs={850} />'])
     expect(settings).toContain(tool);
 });
 it("keeps network observers lazy and leaves the fixed-size diagnostics placeholder visible",()=>{
   expect(settings).toContain('scheduleSettingsVisualStage(() => {');
   expect(settings).toContain('setReadyNetwork(true)');
   expect(settings).toContain('stableFrames: 3');
   expect(settings).toContain('backgroundFallbackMs: 1800');
   expect(settings).toContain('SettingsNetworkPlaceholder');
   const scheduler=readFileSync("src/lib/after-paint-task.ts","utf8");
   expect(scheduler).toContain("requestAnimationFrame");
   expect(scheduler).toContain('document.removeEventListener("visibilitychange", onVisibility)');
 });
});
