import { describe, expect, it, vi } from "vitest";
import { readEditorClip, readEditorClipIds } from "./editor-idb-read";

function mockLibrary(result: unknown = null) {
  let aborted = 0;
  let opened = 0;
  const request = {
    result, error: null as Error | null,
    onsuccess: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  const store = {
    get: (_id: string) => request,
    getAllKeys: () => request,
  };
  const transaction = {
    objectStore: (_name: string) => store,
    error: null as Error | null,
    onerror: null as (() => void) | null,
    onabort: null as (() => void) | null,
    abort() { aborted++; transaction.onabort?.(); },
  };
  const db = {
    transaction: (name: string, mode: string) => {
      expect(name).toBe("clips");
      expect(mode).toBe("readonly");
      opened++;
      return transaction;
    },
  } as unknown as IDBDatabase;
  return {
    db, request,
    succeed() { request.onsuccess?.(); },
    fail() { request.error = new Error("IndexedDB failed"); request.onerror?.(); },
    get aborted() { return aborted; },
    get opened() { return opened; },
  };
}

describe("Editor IndexedDB reads are cancelled at the real transaction", () => {
  it("keeps the original full recorded clip intact when a read succeeds", async () => {
    const blob = new Blob(["original"], { type: "video/mp4" });
    const library = mockLibrary({ id: "first", blob, duration: 15 });
    const pending = readEditorClip<{ id: string; blob: Blob; duration: number }>(library.db, "first");
    library.succeed();
    const clip = await pending;
    expect(clip?.blob).toBe(blob);
    expect(clip?.duration).toBe(15);
    expect(library.aborted).toBe(0);
  });

  it("only returns string clip IDs and preserves their original order", async () => {
    const library = mockLibrary(["one", 9, "two", null]);
    const pending = readEditorClipIds(library.db);
    library.succeed();
    expect(await pending).toEqual(["one", "two"]);
  });

  it("abort during a large Blob read cancels the underlying readonly transaction immediately", async () => {
    const library = mockLibrary();
    const stop = new AbortController();
    const pending = readEditorClip(library.db, "long-video", stop.signal);
    stop.abort();
    await expect(pending).rejects.toThrow("Editor clip read cancelled");
    expect(library.aborted).toBe(1);
    expect(library.request.onsuccess).toBeNull();
  });

  it("does not start a new transaction when the Editor already closed", async () => {
    const library = mockLibrary();
    const stop = new AbortController();
    stop.abort();
    await expect(readEditorClipIds(library.db, stop.signal)).rejects.toThrow("cancelled");
    expect(library.opened).toBe(0);
  });

  it("preserves real IndexedDB errors for the existing library recovery UI", async () => {
    const library = mockLibrary();
    const pending = readEditorClip(library.db, "broken");
    library.fail();
    await expect(pending).rejects.toThrow("IndexedDB failed");
  });

  it("aborts an unresponsive IndexedDB read rather than waiting indefinitely", async () => {
    vi.useFakeTimers();
    try {
      const library = mockLibrary();
      const pending = readEditorClip(library.db, "stalled");
      const assertion = expect(pending).rejects.toThrow("Editor clip read timed out");
      await vi.advanceTimersByTimeAsync(4500);
      await assertion;
      expect(library.aborted).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not abort a successful clip read if tab navigation occurs afterward", async () => {
    const library = mockLibrary({ id: "success" });
    const stop = new AbortController();
    const pending = readEditorClip(library.db, "success", stop.signal);
    library.succeed();
    stop.abort();
    await expect(pending).resolves.toEqual({ id: "success" });
    expect(library.aborted).toBe(0);
  });
});
