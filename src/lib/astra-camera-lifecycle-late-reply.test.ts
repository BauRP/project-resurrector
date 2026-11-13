import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra: stale Android Camera2 replies never change a successor camera UI", () => {
  const source = readFileSync("src/components/multicam/CameraTab.tsx", "utf8");
  it("quarantines a late AI initialization response after AI toggle or unmount", () => {
    const ai = source.slice(source.indexOf('const [aiEngine, setAiEngine]'), source.indexOf('const [rawNative, setRawNative]'));
    expect(ai).toContain("let active = true;");
    expect(ai).toContain("if (active) setAiEngine(engine)");
    expect(ai).toContain('if (active) setAiEngine("web")');
    expect(ai).toContain("return () => { active = false; };");
    expect(ai).toContain("hybridAI(false, s.focusModeAI)");
  });
  it("rejects an old capabilities reply after preview is toggled off and back on", () => {
    const capabilities = source.slice(source.indexOf("cameraMounted.current = true;"), source.indexOf("const [meterOk, setMeterOk]"));
    expect(capabilities).toContain("let active = true;");
    expect(capabilities).toContain("if (!active || !cameraMounted.current) return;");
    expect(capabilities).toContain("if (active && cameraMounted.current) setRawNative(false)");
    expect(capabilities).toContain("return () => { active = false; cameraMounted.current = false; };");
  });
  it("does not alter an old MediaStream when a metering request finishes late", () => {
    const metering = source.slice(source.indexOf("const [meterOk, setMeterOk]"), source.indexOf("const faceBox = useFaceTracking("));
    expect(metering).toContain("let active = true;");
    expect(metering).toContain("if (!active || latestPhotoStream.current !== stream) return;");
    expect(metering).toContain("void applyAdvanced(stream,");
    expect(metering).toContain("return () => { active = false; };");
    expect(metering).toContain("if (active && latestPhotoStream.current === stream) setMeterOk(false)");
  });
  it("keeps tap-to-focus result bound to the same live camera stream", () => {
    const tap = source.slice(source.indexOf("const tapFocus = async"), source.indexOf("// Pro tools: AI engine"));
    expect(tap).toContain("await cameraController.apply(stream");
    expect(tap).toContain("if (!ok && cameraMounted.current && latestPhotoStream.current === stream)");
    expect(tap).toContain('setFocusError("Камера не применила фокус по точке")');
  });
});
