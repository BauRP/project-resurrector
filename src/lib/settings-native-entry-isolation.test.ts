import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Settings first-paint transition on slow native WebViews", () => {
  const app=readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
  const gate=readFileSync("src/components/multicam/SettingsEntryGate.tsx","utf8");
  const settings=readFileSync("src/components/multicam/SettingsTab.tsx","utf8");
  const folds=readFileSync("src/lib/display-topology.ts","utf8");
  it("does not mount the full Settings module in the Camera teardown commit",()=>{
    expect(app).toContain('const SettingsTab = lazy(() => loadSettingsModule().then');
    expect(app).toContain("return scheduleSettingsPreload()");
    expect(app).toContain("<SettingsEntryGate><Suspense");
    expect(gate).toContain("window.requestAnimationFrame");
    expect(gate).toContain("window.setTimeout(enter, 0)");
    expect(gate).toContain("window.setTimeout(enter, 180)");
    expect(gate).toContain("window.cancelAnimationFrame(frame)");
  });
  it("keeps all Settings tools and themes, without auto-launching Camera2",()=>{
    for(const required of ["<NativeRecordingPanel previewIntervalMs={850} />",
      "<CameraDiagnostics />","s.set({theme:\"dark\"})","s.set({theme:\"light\"})",
      "<SettingsNetworkContent />","clearPreviewCache()","cacheBytes()"])expect(settings).toContain(required);
    expect(settings).toContain('lazy(() => import("./SettingsNetworkContent")');
    expect(settings).not.toContain('import { mesh } from "@/lib/mesh"');
    expect(settings).toContain('advancedPanel === "native" &&');
    expect(settings).toContain('advancedPanel === "diagnostics" &&');
  });
  it("coalesces DOM churn on single screens but still tracks fold features and tab changes",()=>{
    expect(folds).toContain('lastNative?.foldingFeatures.some(feature => feature.separating) === true');
    expect(folds).toContain("cameraChanged || tabChanged || foldHasSeparatingHinge");
    expect(folds).toContain('window.addEventListener("multicam-tab-rendered", scheduleMeasure)');
    expect(folds).toContain('window.removeEventListener("multicam-tab-rendered", scheduleMeasure)');
    expect(app).toContain('window.dispatchEvent(new Event("multicam-tab-rendered"))');
    expect(folds).toContain("NativeDisplay.startObserving({ ownerId })");
  });
});
