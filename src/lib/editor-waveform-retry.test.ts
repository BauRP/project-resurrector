import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { editorWaveformDecision } from "./editor-waveform-retry";

describe("Editor waveform retry without Android WebView decode storms", () => {
  it("retries a failed codec/storage attempt on a later edit", () => {
    expect(editorWaveformDecision(null, false)).toBe("retry");
  });

  it("retries an interrupted, not-started optional waveform job", () => {
    expect(editorWaveformDecision(undefined, false)).toBe("retry");
  });

  it("does not repeatedly decode hour-long videos excluded by the RAM guard", () => {
    expect(editorWaveformDecision([], false)).toBe("done");
  });

  it("keeps genuine waveform peaks and honors cancellation", () => {
    expect(editorWaveformDecision([0.2, 0.8], false)).toBe("done");
    expect(editorWaveformDecision([0.2], true)).toBe("cancel");
    expect(editorWaveformDecision(null, true)).toBe("cancel");
  });

  it("wires the policy to the real Editor, preserving PCM size guards", () => {
    const source = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(source).toContain("editorWaveformDecision(peaks, !live || abort.signal.aborted)");
    expect(source).toContain('if (decision === "retry") {');
    expect(source).toContain("waveformAttempted.current.delete(m.id)");
    expect(source).toContain("if (!canDecodeWaveformInMemory(clip.blob.size, duration, memoryGiB)) return [];");
    expect(source).toContain("if (peaks && peaks.length > 0) {");
    expect(source).toContain("analysisCache.set(m.id, { duration: m.duration, peaks, sourceKey: m.sourceKey });");
    expect(source).toContain("editorMediaWorkQueue.run(");
  });
});
