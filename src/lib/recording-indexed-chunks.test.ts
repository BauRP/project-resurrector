import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordingIndexedChunks } from "./recording-indexed-chunks";

type Req = { result?: unknown; error?: Error | null; onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void; onblocked?: () => void };
type Tx = {
  oncomplete?: () => void; onabort?: () => void; onerror?: () => void;
  error: Error | null; objectStore: (_name: string) => {
    put: (value: Blob, key: string) => void;
    get: (key: string) => Req;
    delete: (key: string) => void;
  };
  abort: () => void;
};
function fakeIndexedDB() {
  const pieces = new Map<string, Blob>();
  const database = {
    objectStoreNames: { contains: (_name: string) => true },
    createObjectStore: (_name: string) => undefined,
    close: () => {},
    onversionchange: null as (() => void) | null,
    transaction: (_store: string, _mode: string): Tx => {
      let aborted = false;
      const reads: Array<() => void> = [];
      const changes: Array<() => void> = [];
      const tx: Tx = {
        error: null,
        objectStore: () => ({
          put: (value: Blob, key: string) => changes.push(() => pieces.set(key, value)),
          get: (key: string) => {
            const request: Req = {};
            reads.push(() => { request.result = pieces.get(key); request.onsuccess?.(); });
            return request;
          },
          delete: (key: string) => changes.push(() => pieces.delete(key)),
        }),
        abort: () => { aborted = true; tx.onabort?.(); },
      };
      queueMicrotask(() => {
        if (aborted) return;
        for (const action of changes) action();
        for (const action of reads) action();
        tx.oncomplete?.();
      });
      return tx;
    },
  };
  vi.stubGlobal("indexedDB", {
    open: (_name: string, _version: number): Req => {
      const request: Req = {};
      queueMicrotask(() => { request.result = database; request.onsuccess?.(); });
      return request;
    },
  });
  return pieces;
}
function readText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("legacy WebView IndexedDB MediaRecorder chunk spool", () => {
  it("stores, reads and removes each encoded piece in recording order", async () => {
    const pieces = fakeIndexedDB();
    const spool = new RecordingIndexedChunks("camera-1");
    await spool.append(new Blob(["first"]));
    await spool.append(new Blob(["middle"]));
    await spool.append(new Blob(["last"]));
    expect(pieces.size).toBe(3);
    const parts = await spool.materialize();
    expect(await readText(new Blob(parts))).toBe("firstmiddlelast");
    await spool.clearAfterSave();
    expect(pieces.size).toBe(0);
  });
  it("keeps independently identified camera spools separate", async () => {
    fakeIndexedDB();
    const one = new RecordingIndexedChunks("rear");
    const two = new RecordingIndexedChunks("front");
    await Promise.all([one.append(new Blob(["rear-1"])),two.append(new Blob(["front-1"]))]);
    expect(await readText(new Blob(await one.materialize()))).toBe("rear-1");
    expect(await readText(new Blob(await two.materialize()))).toBe("front-1");
  });
  it("falls back to memory safely if IndexedDB is unavailable", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const spool = new RecordingIndexedChunks("no-database");
    await expect(spool.append(new Blob(["a"]))).rejects.toThrow();
  });
});
