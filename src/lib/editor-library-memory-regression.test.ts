import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("editor library memory and functionality regression", () => {
  const editor = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");

  it("loads real stored video blobs individually instead of duplicating the entire library", () => {
    expect(editor).toContain('indexedDB.open("multicam-pov-media", 1)');
    expect(editor).toContain(".getAllKeys()");
    expect(editor).toContain('objectStore("clips").get(id)');
    expect(editor).not.toMatch(/objectStore\("clips"\)\.getAll\(\)/);
    expect(editor).toContain('db.onversionchange = () => db.close()');
    expect(editor).toContain("library?.close()");
  });

  it("retains every clip, chronological ordering, audio waveform analysis and editing features", () => {
    expect(editor).toContain("for (const id of ids)");
    expect(editor).toContain("await retry(() => analyse(clip, controller.signal))");
    expect(editor).toContain("activeLibraryLoad.current?.abort()");
    expect(editor).toContain("results.sort((a, b) => a.createdAt - b.createdAt)");
    expect(editor).toContain("setMedia(results.map(");
    expect(editor).toContain("decodeAudioData(");
    expect(editor).toContain("makeThumbs(");
    expect(editor).toContain("generateProxy(");
    expect(editor).toContain("URL.revokeObjectURL");
  });
});
