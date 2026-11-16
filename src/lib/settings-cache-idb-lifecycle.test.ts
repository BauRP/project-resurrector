import { afterEach, describe, expect, it, vi } from "vitest";
import { analysisCache, cacheBytes, clearPreviewCache, thumbCache } from "./media-cache";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  analysisCache.clear();
  thumbCache.clear();
});

function mockCacheDb() {
  let open: (() => void) | undefined;
  let aborts = 0;
  let closes = 0;
  let clearCount = 0;
  let eventCount = 0;
  let cursor: { value: unknown; continue: () => void } | null = null;
  let request: {
    result: { value: unknown; continue: () => void } | null; error: Error | null;
    onsuccess: (() => void) | null; onerror: (() => void) | null;
  } | undefined;
  let tx: {
    error: Error | null;
    oncomplete: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
    abort: () => void;
    objectStore: (name: string) => { openCursor: () => typeof request; clear: () => void };
  } | undefined;
  const db = {
    onversionchange: null as (() => void) | null,
    close: () => { closes++; },
    transaction: (names: string | string[], mode: string) => {
      if (mode === "readonly") expect(names).toBe("proxy-meta");
      else { expect(names).toEqual(["proxies", "proxy-meta"]); expect(mode).toBe("readwrite"); }
      request = { result: null, error: null, onsuccess: null, onerror: null };
      tx = {
        error: null, oncomplete: null, onerror: null, onabort: null,
        abort: () => { aborts++; tx?.onabort?.(); },
        objectStore: (_name: string) => ({
          openCursor: () => request,
          clear: () => { clearCount++; },
        }),
      };
      return tx;
    },
  } as unknown as IDBDatabase;
  vi.stubGlobal("indexedDB", { open: () => {
    const req = { result: db, error: null, onupgradeneeded: null, onblocked: null,
      onerror: null, onsuccess: null as (() => void) | null };
    open = () => req.onsuccess?.();
    queueMicrotask(() => open?.());
    return req;
  } });
  vi.stubGlobal("window", { dispatchEvent: (e: Event) => {
    if (e.type === "multicam-preview-cache-cleared") eventCount++;
  } });
  return {
    async started() {
      for (let i = 0; i < 20 && !tx; i++) await Promise.resolve();
      expect(tx).toBeDefined();
    },
    putCursor(value: { size: number }) {
      if (!request) throw new Error("missing request");
      cursor = { value, continue: () => undefined };
      request.result = cursor;
      request.onsuccess?.();
    },
    endCursor() {
      if (!request) throw new Error("missing request");
      request.result = null;
      request.onsuccess?.();
    },
    commit: () => tx?.oncomplete?.(),
    get aborts() { return aborts; },
    get closes() { return closes; },
    get clearedStores() { return clearCount; },
    get clearedEvents() { return eventCount; },
  };
}

describe("Android Settings cache measurement and deletion stay bounded", () => {
  it("sums metadata only and releases the cursor connection after commit", async () => {
    const cache = mockCacheDb();
    const read = cacheBytes();
    await cache.started();
    cache.putCursor({ size: 1048576 });
    cache.putCursor({ size: 512 });
    cache.endCursor();
    cache.commit();
    await expect(read).resolves.toBe(1049088);
    expect(cache.aborts).toBe(0);
    expect(cache.closes).toBe(1);
  });

  it("aborts the real read transaction if Android WebView stops answering", async () => {
    vi.useFakeTimers();
    try {
      const cache = mockCacheDb();
      const read = cacheBytes();
      await cache.started();
      const assertion = expect(read).rejects.toThrow("Measure cache: timeout");
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
      expect(cache.aborts).toBe(1);
      expect(cache.closes).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("clears disposable stores but retains derived cache until commit", async () => {
    const cache = mockCacheDb();
    analysisCache.set("original", { duration: 15, peaks: [] });
    thumbCache.set("original", ["thumbnail"]);
    const pending = clearPreviewCache();
    await cache.started();
    expect(cache.clearedStores).toBe(2);
    expect(analysisCache.size).toBe(1);
    expect(cache.clearedEvents).toBe(0);
    cache.commit();
    await expect(pending).resolves.toBe(0);
    expect(analysisCache.size).toBe(0);
    expect(thumbCache.size).toBe(0);
    expect(cache.clearedEvents).toBe(1);
  });

  it("aborts a stalled clear without claiming that cache was deleted", async () => {
    vi.useFakeTimers();
    try {
      const cache = mockCacheDb();
      analysisCache.set("keep", { duration: 60, peaks: [] });
      const pending = clearPreviewCache();
      await cache.started();
      const assertion = expect(pending).rejects.toThrow("Clear previews: timeout");
      await vi.advanceTimersByTimeAsync(7000);
      await assertion;
      expect(cache.aborts).toBe(1);
      expect(cache.closes).toBe(1);
      expect(cache.clearedEvents).toBe(0);
      expect(analysisCache.size).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
