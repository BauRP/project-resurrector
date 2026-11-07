import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("safe Android startup and preview", () => {
 it("does not ask for permissions during splash", () => {
   const c=readFileSync("src/components/multicam/SplashScreen.tsx","utf8");
   expect(c).toContain("loadMatrix() ?? emptyCapabilityMatrix(");
   expect(c).not.toContain("probeDeviceSafe(");
   expect(c).not.toContain("Запрос разрешений...");
 });
 it("requires user action to open camera and preserves native mode access", () => {
   const c=readFileSync("src/components/multicam/CameraTab.tsx","utf8");
   const w=readFileSync("src/components/multicam/CameraWorkspace.tsx","utf8");
   expect(c).toContain("const [previewRequested, setPreviewRequested] = useState(false)");
   expect(c).toContain("if (!previewRequested) return");
   expect(c).toContain("setPreviewRequested(true)");
   expect(c).toContain('s.capMatrix.permissions.camera !== "not-requested"');
   expect(c).toContain("if (isNative() && previewRequested) void MultiCamNative.getCapabilities()");
   expect(c).toContain("if (!previewRequested || !stream) return");

   expect(w).toContain('isNative() && mode === "native"');
   expect(w).toContain('const [mode, setMode] = useState<Mode>("web")');
   expect(w).toContain('bounded(nativeCapture.status(), 2200, "Camera2 startup ownership")');
   expect(w).toContain('manualModeSelection.current');
   expect(c).not.toContain('if (s.role === "solo" && peers.length === 0) return');
   expect(c).toContain('const id = window.setInterval(poll, 5000)');
   expect(w).not.toContain("useState<Mode | null>(isNative() ? null");

   expect(c).toContain("Перейти в Camera2");
 });
 it("preserves background telemetry without repainting the entire idle Camera screen", () => {
   const c=readFileSync("src/components/multicam/CameraTab.tsx","utf8");
   const entry=readFileSync("src/capacitor-main.tsx","utf8");
   expect(c).toContain("void mesh.sendTelemetry().catch(");
   expect(c).toContain("scheduleAfterPaintTask(poll, 2400)");
   expect(c).toContain("const id = window.setInterval(poll, 5000)");
   expect(c).toContain("cancelFirstPoll()");
   expect(c).not.toContain("setSelf(");
   expect(entry).toContain('if (Capacitor.isNativePlatform()) {');
   expect(entry).toContain('document.documentElement.dataset["multicamNativeWebview"] = "true"');
   expect(entry.indexOf('dataset["multicamNativeWebview"]')).toBeLessThan(entry.indexOf('createRoot(rootElement)'));
 });
});