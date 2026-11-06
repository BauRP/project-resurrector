import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MiB, canDecodeWaveformInMemory, waveformDecodeBudget } from "./waveform-memory-budget";

describe("large video waveform memory guard", () => {
  it("retains actual waveform decoding for ordinary short recordings", () => {
    expect(canDecodeWaveformInMemory(2 * MiB, 30, 1)).toBe(true);
    expect(canDecodeWaveformInMemory(10 * MiB, 60, 4)).toBe(true);
  });
  it("rejects the OOM paths: huge MP4 bytes and short compressed hours-long audio", () => {
    expect(canDecodeWaveformInMemory(700 * MiB, 20, 8)).toBe(false);
    expect(canDecodeWaveformInMemory(3 * MiB, 3600, 8)).toBe(false);
    expect(canDecodeWaveformInMemory(Number.NaN, 20, 8)).toBe(false);
    expect(canDecodeWaveformInMemory(4 * MiB, Number.POSITIVE_INFINITY, 8)).toBe(false);
  });
  it("uses conservative limits when older Android WebView omits deviceMemory", () => {
    expect(waveformDecodeBudget()).toBe(40 * MiB);
    expect(waveformDecodeBudget(0.5)).toBe(32 * MiB);
    expect(waveformDecodeBudget(8)).toBe(128 * MiB);
    expect(canDecodeWaveformInMemory(16 * MiB, 30)).toBe(false);
  });
  it("checks size and expanded PCM before invoking any full-file FileReader", () => {
    const src = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    const start = src.indexOf("async function analyseWaveformForTimeline(");
    const finish = src.indexOf("export function EditorPro(", start);
    const body = src.slice(start, finish);
    expect(body.indexOf("canDecodeWaveformInMemory(")).toBeLessThan(body.indexOf("readWaveformData(clip.blob, signal)"));
    expect(body).toContain("decodeAudioData(bytes)");
    expect(body).toContain("extractWaveformPeaks");
  });
});
