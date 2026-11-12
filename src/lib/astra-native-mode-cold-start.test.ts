import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("Astra native Camera2 restores without competing with the first frame",()=>{
 const s=readFileSync("src/components/multicam/CameraWorkspace.tsx","utf8");
 it("stages saved native panel after responsive frames",()=>{
   expect(s).toContain("scheduleAfterResponsivePaint(() => {");
   expect(s).toContain("stableFrames: 3, maxFrameGapMs: 350");
   expect(s).toContain("nativeUiReady ? <Suspense");
   expect(s).toContain("<NativeRecordingPanel />");
   expect(s).toContain("setNativeUiReady(false)");
 });
 it("does not disable native recording, ownership or camera status recovery",()=>{
   expect(s).toContain("startNativeStatusRecovery(");
   expect(s).toContain("nativeRecorderOwnsCamera(status.state)");
   expect(s).toContain("mayFinishCameraOwnerSwitch(");
 });
});
