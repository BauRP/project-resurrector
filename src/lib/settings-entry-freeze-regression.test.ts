import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("Settings freeze diagnosis without dropping features", () => {
  it("records rendering and event-loop milestones after entering Settings", () => {
    const settings = readFileSync("src/components/multicam/SettingsTab.tsx","utf8");
    const app = readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
    for (const stage of ["settings: mounted","settings: first paint frame","settings: second paint frame","settings: event loop alive 1s"]) expect(settings).toContain(stage);
    expect(app).toContain("settings: React commit complete");
    expect(settings).toContain("window.cancelAnimationFrame(frameA)");
    expect(settings).toContain("window.clearTimeout(timer)");
    expect(settings).toContain("clearPreviewCache()");
    expect(settings).toContain("<CameraDiagnostics />");
  });
  it("coalesces repeated OEM layout events without skipping capture evidence", () => {
    const code = readFileSync("android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java","utf8");
    expect(code).toContain("measuredWindowFingerprint()");
    expect(code).toContain("lastNotifiedGeometry = null");
    expect(code).toContain("if (!nextGeometry.equals(lastNotifiedGeometry))");
    expect(code.indexOf("NativeCaptureService.observeFoldDuringRecording(lease"))
      .toBeLessThan(code.indexOf("if (!nextGeometry.equals(lastNotifiedGeometry))"));
    expect(code).toContain("updateSurfaceHinges(lease,info)");
    // The native listener still sends every changed topology, but the bridge
    // call must occur after the synchronized WindowManager callback section.
    expect(code).toContain("pendingTopologyNotification = snapshot();");
    expect(code).toContain('notifyListeners("topologyChanged", pendingTopologyNotification)');
  });
});
