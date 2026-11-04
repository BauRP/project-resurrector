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
   expect(c).toContain("if (isNative() && previewRequested) void MultiCamNative.getCapabilities()");
   expect(c).toContain("if (!previewRequested || !stream) return");

   expect(w).toContain('isNative() && mode === "native"');
   expect(c).toContain("Перейти в Camera2");
 });
});