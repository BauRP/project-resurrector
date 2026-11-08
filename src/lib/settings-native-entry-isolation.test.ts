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
    expect(gate).toContain("scheduleAfterResponsivePaint(");
    expect(gate).toContain("stableFrames: 3");
    expect(gate).toContain("uiFreeze.awaitVisualState()");
    expect(gate).toContain("stableFrames: 2");
    expect(gate).not.toContain("}, 1100)");
    const scheduler = readFileSync("src/lib/after-paint-task.ts", "utf8");
    expect(scheduler).toContain("requestAnimationFrame");
    expect(scheduler).toContain("cancelAnimationFrame");
    expect(scheduler).toContain("setTimeout(fire, fallbackMs)");
  });
  it("keeps all Settings tools and themes, without auto-launching Camera2",()=>{
    for(const required of ["<NativeRecordingPanel previewIntervalMs={850} />",
      "<CameraDiagnostics />","s.set({theme:\"dark\"})","s.set({theme:\"light\"})",
      "<SettingsNetworkContent />","clearPreviewCache()","cacheBytes()"])expect(settings).toContain(required);
    expect(settings).toContain('lazy(() => import("./SettingsNetworkContent")');
    expect(settings).toContain('const [readyNetwork, setReadyNetwork]');
    expect(settings).toContain('settings: network controls mounted after responsive paint');
    expect(settings).toContain('readyNetwork ? <Suspense');
    expect(settings).not.toContain('import { mesh } from "@/lib/mesh"');
    expect(settings).toContain('advancedPanel === "native" &&');
    expect(settings).toContain('advancedPanel === "diagnostics" &&');
  });
  it("coalesces DOM churn on single screens but still tracks fold features and tab changes",()=>{
    expect(folds).toContain('lastNative?.foldingFeatures.some(feature => feature.separating) === true');
    expect(folds).toContain("cameraChanged || tabChanged || foldHasSeparatingHinge");
    expect(folds).toContain('window.addEventListener("multicam-tab-rendered", onTabRendered)');
    expect(folds).toContain('window.removeEventListener("multicam-tab-rendered", onTabRendered)');
    expect(folds).toContain("syncContentObservation()");
    expect(folds).toContain("if (needed) mutations.observe(content");
    expect(app).toContain('window.dispatchEvent(new Event("multicam-tab-rendered"))');
    expect(folds).toContain("NativeDisplay.startObserving({ ownerId })");
  });
});
