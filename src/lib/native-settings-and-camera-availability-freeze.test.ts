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

describe("Settings staged native-first paint", () => {
  const settings = readFileSync("src/components/multicam/SettingsTab.tsx","utf8");
  it("shows theme and language before expensive controls without disabling them", () => {
    expect(settings).toContain('useState(() => !Capacitor.isNativePlatform())');
    expect(settings.indexOf('title={tc.theme}')).toBeLessThan(settings.indexOf('{readyBody && <>'));
    expect(settings.indexOf('title={t.language}')).toBeLessThan(settings.indexOf('{readyBody && <>'));
    for(const tool of ['title={t.network}', 'title={t.storage}', 'title={t.engine}', '<CameraDiagnostics />', '<NativeRecordingPanel previewIntervalMs={850} />'])
      expect(settings).toContain(tool);
  });
  it("never mounts heavyweight Settings during a foreground renderer stall, retaining a bounded hidden-WebView fallback", () => {
    expect(settings).toContain("scheduleSettingsVisualStage(() => {");
    expect(settings).toContain("setReadyBody(true)");
    expect(settings).toContain("stableFrames: 3");
    expect(settings).toContain("backgroundFallbackMs: 1800");
    expect(settings).toContain("}, 350)");
    const scheduler = readFileSync("src/lib/after-paint-task.ts", "utf8");
    expect(scheduler).toContain('if (document.hidden) armBackground();');
    expect(scheduler).toContain("fallback = setTimeout(finish, backgroundFallbackMs)");
    expect(scheduler).toContain("document.removeEventListener(\"visibilitychange\", onVisibility)");
  });
});
