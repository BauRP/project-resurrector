import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { staleEditorProxyIds, type EditorProxyHandle } from "./editor-proxy-url-lifecycle";

const entries = new Map<string, EditorProxyHandle>([
  ["clip-a", { sourceUrl: "blob:original-a", proxyUrl: "blob:proxy-a" }],
  ["clip-b", { sourceUrl: "blob:original-b", proxyUrl: "blob:proxy-b" }],
]);

describe("Editor preview Blob URL ownership across timeline changes", () => {
  it("retains preview URLs when the same original clips remain in the timeline", () => {
    const visible = new Map([["clip-a", "blob:original-a"], ["clip-b", "blob:original-b"]]);
    expect(staleEditorProxyIds(entries, visible)).toEqual([]);
  });

  it("releases the disposable preview of an unlinked or removed timeline clip", () => {
    const visible = new Map([["clip-b", "blob:original-b"]]);
    expect(staleEditorProxyIds(entries, visible)).toEqual(["clip-a"]);
    // No modification of original video URLs or the underlying video database.
    expect(entries.get("clip-a")?.sourceUrl).toBe("blob:original-a");
  });

  it("invalidates an old proxy when its original media URL changes under the same id", () => {
    const visible = new Map([["clip-a", "blob:replacement"], ["clip-b", "blob:original-b"]]);
    expect(staleEditorProxyIds(entries, visible)).toEqual(["clip-a"]);
  });

  it("releases all orphaned disposable proxy URLs when the timeline is emptied", () => {
    expect(staleEditorProxyIds(entries, new Map())).toEqual(["clip-a", "clip-b"]);
  });

  it("integrates real timeline cleanup without touching original clip storage", () => {
    const editor = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(editor).toContain("staleEditorProxyIds(proxyHandles.current, sources)");
    expect(editor).toContain("URL.revokeObjectURL(handle.proxyUrl)");
    expect(editor).toContain("proxyUrls.current.delete(handle.proxyUrl)");
    expect(editor).toContain("proxyHandles.current.delete(id)");
    expect(editor).toContain("loadedProxyIds.current.delete(id)");
    expect(editor).toContain("thumbCache.delete(id)");
    expect(editor).toContain("proxyHandles.current.set(m.id, { sourceUrl: m.url, proxyUrl: url })");
    expect(editor).not.toContain("URL.revokeObjectURL(handle.sourceUrl)");
  });
});
