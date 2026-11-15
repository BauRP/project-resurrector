import { afterEach, describe, expect, it, vi } from "vitest";
import { readProxy } from "./media-cache";
import { readFileSync } from "node:fs";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fakeCache() {
  let aborts = 0;
  let closes = 0;
  let request: {
    result: unknown; error: Error | null; onsuccess: (() => void) | null;
    onerror: (() => void) | null;
  };
  let tx: {
    error: Error | null;
    oncomplete: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
    abort: () => void;
    objectStore: (name: string) => { get: (id: string) => typeof request; put: (v: unknown) => void };
  };
  let openSuccess: (() => void) | null = null;
  let getCalls = 0;
  let metaWrites = 0;
  const db = {
    onversionchange: null as (() => void) | null,
    close: () => { closes++; },
    transaction: (_names: string[], mode: string) => {
      expect(mode).toBe("readwrite");
      request = { result: undefined, error: null, onsuccess: null, onerror: null };
      tx = {
        error: null, oncomplete: null, onerror: null, onabort: null,
        abort: () => { aborts++; tx.onabort?.(); },
        objectStore: (name: string) => ({
          get: (_id: string) => { getCalls++; return request; },
          put: (_value: unknown) => { if (name === "proxy-meta") metaWrites++; },
        }),
      };
      return tx;
    },
  } as unknown as IDBDatabase;
  vi.stubGlobal("indexedDB", {
    open: () => {
      const o = {
        result: db,
        error: null,
        onblocked: null,
        onerror: null,
        onupgradeneeded: null,
        onsuccess: null as (() => void) | null,
      };
      openSuccess = () => o.onsuccess?.();
      queueMicrotask(() => openSuccess?.());
      return o;
    },
  });
  return {
    get request() { return request; },
    resolveRead: (blob: Blob) => { request.result = blob; request.onsuccess?.(); },
    complete: () => tx.oncomplete?.(),
    get aborts() { return aborts; },
    get closes() { return closes; },
    get getCalls() { return getCalls; },
    get metaWrites() { return metaWrites; },
  };
}

describe("Android editor stops optional preview cache IO on exit", () => {
  it("returns the cached proxy after IndexedDB commit with its LRU metadata", async () => {
    const cache = fakeCache();
    const requested = readProxy("clip");
    await Promise.resolve();
    const blob = new Blob(["preview"], { type: "video/webm" });
    cache.resolveRead(blob);
    cache.complete();
    await expect(requested).resolves.toBe(blob);
    expect(cache.metaWrites).toBe(1);
    expect(cache.aborts).toBe(0);
    expect(cache.closes).toBe(1);
  });

  it("aborts the real transaction and never writes LRU data when editor closes", async () => {
    const cache = fakeCache();
    const controller = new AbortController();
    const requested = readProxy("clip", controller.signal);
    await Promise.resolve();
    controller.abort();
    await expect(requested).rejects.toThrow("Proxy cache read cancelled");
    expect(cache.aborts).toBe(1);
    expect(cache.metaWrites).toBe(0);
    expect(cache.closes).toBe(1);
  });

  it("does not open cache on an already cancelled editor", async () => {
    const cache = fakeCache();
    const controller = new AbortController();
    controller.abort();
    await expect(readProxy("clip", controller.signal)).resolves.toBeNull();
    expect(cache.getCalls).toBe(0);
  });

  it("terminates blocked IDB reads and releases the connection on timeout", async () => {
    vi.useFakeTimers();
    try {
      const cache = fakeCache();
      const requested = readProxy("clip");
      const assertion = expect(requested).rejects.toThrow("Read proxy: timeout");
      await vi.advanceTimersByTimeAsync(5000);
      await assertion;
      expect(cache.aborts).toBe(1);
      expect(cache.closes).toBe(1);
    } finally { vi.useRealTimers(); }
  });

  it("passes cancellation from the real proxy encoder to the cache read", () => {
    const source = readFileSync("src/lib/video-proxy.ts", "utf8");
    expect(source).toContain("readProxy(id, signal)");
    expect(source).toContain("if (signal.aborted) return null");
  });
});
