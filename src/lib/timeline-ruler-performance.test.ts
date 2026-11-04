import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { visibleRulerTicks } from "./timeline";

describe("editor timeline ruler preserves function without mounting thousands of invisible nodes", () => {
  it("shows the same one-second ruler markings at close zoom", () => {
    expect(visibleRulerTicks(10, 50, 0, 700, 104)).toEqual(Array.from({length: 11}, (_, i) => i));
  });
  it("keeps regular five-second markings, then shows later marks on scroll", () => {
    const initial = visibleRulerTicks(3600, 8, 0, 400, 104);
    const moved = visibleRulerTicks(3600, 8, 960, 400, 104);
    expect(initial[0]).toBe(0);
    expect(initial.every(s => s % 5 === 0)).toBe(true);
    expect(moved.some(s => s >= 120)).toBe(true);
    expect(moved.length).toBeLessThan(30);
    expect(initial.length).toBeLessThan(30);
  });
  it("never generates a giant React subtree even for an entire day", () => {
    for (const zoom of [0.01, 1, 8, 20, 600]) {
      const ticks = visibleRulerTicks(86400, zoom, 100, 1200, 104);
      expect(ticks.length).toBeLessThanOrEqual(160);
      expect(ticks.every(s => s >= 0 && s <= 86400)).toBe(true);
    }
  });
  it("does not delete the ruler, trimming, zoom, playhead or other editor functions", () => {
    const code = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(code).toContain("rulerTicks.map((s) =>");
    expect(code).toContain("visibleRulerTicks(total, zoom, scrollX, tlW, HEAD)");
    expect(code).toContain('aria-label="Масштаб таймлайна"');
    expect(code).toContain('aria-label="Курсор воспроизведения"');
    expect(code).toContain("visibleTiles(");
  });
});
