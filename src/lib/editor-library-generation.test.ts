import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isCurrentEditorLibraryLoad } from "./editor-library-generation";

describe("Editor media library cancellation and Blob URL lifetime", () => {
  it("accepts only the live generation and an un-aborted scan", () => {
    expect(isCurrentEditorLibraryLoad(1, 1, false)).toBe(true);
    expect(isCurrentEditorLibraryLoad(1, 2, false)).toBe(false);
    expect(isCurrentEditorLibraryLoad(2, 2, true)).toBe(false);
    expect(isCurrentEditorLibraryLoad(2, 3, true)).toBe(false);
  });

  it("never publishes a completed old scan after navigation and revokes its transient video URLs", () => {
    const source = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    const staleBranch = source.slice(
      source.indexOf("if (!isCurrentEditorLibraryLoad(generation, loadGeneration.current, controller.signal.aborted))"),
      source.indexOf("results.sort((a, b) => a.createdAt - b.createdAt)")
    );
    expect(staleBranch).toContain("URL.revokeObjectURL(item.url)");
    expect(staleBranch).toContain("return;");
    expect(source).toContain("activeLibraryLoad.current?.abort()");
    expect(source).toContain("if (isCurrentEditorLibraryLoad(generation, loadGeneration.current, controller.signal.aborted)) setLoading(false)");
  });
});
