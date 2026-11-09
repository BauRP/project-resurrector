import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("a missing emulator camera is not falsely diagnosed as a manual-focus defect", () => {
  it("keeps real unsupported focus warnings without advertising a missing video track as unsupported hardware", () => {
    const code = readFileSync("src/components/multicam/CameraTab.tsx","utf8");
    expect(code).not.toContain('cameraState !== "live" && <div className="camera-focus-status');
    expect(code).toContain('setFocusWarning(support === "unsupported" && !pointCapable)');
    expect(code).toContain('{focusWarning && <p role="alert"');
  });
});
