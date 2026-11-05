import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("editor only allocates audio decoders for overlapping timeline clips", () => {
  it("retains all audible track logic but mounts only near playhead", () => {
    const code = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(code).toContain("const audible = useMemo(");
    expect(code).toContain("const activeAudible = useMemo(");
    expect(code).toContain("t >= i.start - 0.5 && t < i.start + len(i)");
    expect(code).toContain("{activeAudible.map((i) => <audio");
    expect(code).toContain('preload="metadata"');
    expect(code).toContain("else delete audioRefs.current[i.id]");
    expect(code).toContain("for (const i of audible)");
  });
});
