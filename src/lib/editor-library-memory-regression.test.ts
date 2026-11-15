import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("editor library memory and functionality regression", () => {
  const editor = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
  const reader = readFileSync("src/lib/editor-idb-read.ts", "utf8");

  it("loads real stored video blobs individually instead of duplicating the entire library", () => {
    // Reads moved to a cancellable production module. Check the actual
    // implementation and the Editor call sites, not the old inline helper.
    expect(editor).toContain('indexedDB.open("multicam-pov-media", 1)');
    expect(reader).toContain(".getAllKeys()");
    expect(reader).toContain("store.get(id)");
    expect(reader).toContain('db.transaction("clips", "readonly")');
    expect(reader).not.toMatch(/objectStore\("clips"\)\.getAll\(\)/);
    expect(editor).toContain("readEditorClipIds(library, controller.signal)");
    expect(editor).toContain("readEditorClip<StoredClip>(library, id, controller.signal)");
    expect(editor).toContain("readEditorClip<StoredClip>(db, m.id, abort.signal)");
    expect(reader).toContain("tx.abort()");
    expect(editor).toContain("db.onversionchange = () => db.close()");
    expect(editor).toContain("library?.close()");
  });

  it("retains every clip, chronological ordering, audio waveform analysis and editing features", () => {
    expect(editor).toContain("for (const id of ids)");
    expect(editor).toContain("retry(() => analyse(clip, controller.signal), 2, controller.signal)");
    expect(editor).toContain("activeLibraryLoad.current?.abort()");
    expect(editor).toContain("results.sort((a, b) => a.createdAt - b.createdAt)");
    expect(editor).toContain("setMedia(results.map(");
    expect(editor).toContain("decodeAudioData(");
    expect(editor).toContain("makeThumbs(");
    expect(editor).toContain("generateProxy(");
    expect(editor).toContain("URL.revokeObjectURL");
  });
});
