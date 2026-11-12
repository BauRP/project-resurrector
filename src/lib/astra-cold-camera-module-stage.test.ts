import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra cold Android start stages heavy camera module after WindowManager and first frame", () => {
  const camera = readFileSync("src/components/multicam/CameraWorkspace.tsx","utf8");
  it("does not load AI/media CameraTab bundle during CameraWorkspace module evaluation", () => {
    expect(camera).not.toContain('import { CameraTab } from "./CameraTab"');
    expect(camera).toContain('lazy(() => import("./CameraTab")');
    expect(camera).toContain("webUiReady ? <Suspense");
    expect(camera).toContain("scheduleAfterResponsivePaint(() => {");
    expect(camera).toContain("stableFrames: 3, maxFrameGapMs: 350");
  });
  it("retains full camera and native mode controls and ownership checks", () => {
    expect(camera).toContain("<CameraTab onOpenNativeMode=");
    expect(camera).toContain("startNativeStatusRecovery(");
    expect(camera).toContain("() => nativeCapture.status(),");
    expect(camera).not.toContain('bounded(nativeCapture.status(), 2200, "Camera2 startup ownership")');
    expect(camera).toContain('bounded(nativeCapture.status(), 2200, "Camera2 mode handoff")');
    expect(camera).toContain("nativeRecorderOwnsCamera(status.state)");
    expect(camera).toContain("mayFinishCameraOwnerSwitch(");
    expect(camera).toContain("<NativeRecordingPanel />");
  });
  it("does not postpone camera UI in regular browser previews", () => {
    expect(camera).toContain("useState(() => !isNative())");
  });
});
