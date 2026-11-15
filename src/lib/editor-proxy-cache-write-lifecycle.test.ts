import { afterEach, describe, expect, it, vi } from "vitest";
import { readProxy, writeProxy } from "./media-cache";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function cacheDb() {
  let openCallback: (() => void) | null = null;
  let blockedCallback: (() => void) | null = null;
  let closes = 0;
  let aborts = 0;
  let puts = 0;
  let deletions = 0;
  let metaRequest: {
    result: unknown; error: Error | null; onsuccess: (() => void) | null;
    onerror: (() => void) | null;
  } | undefined;
  let transaction: {
    error: Error | null;
    oncomplete: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
    abort: () => void;
    objectStore: (name: string) => {
      getAll: () => typeof metaRequest;
      get: (id: string) => typeof metaRequest;
      put: (...args: unknown[]) => void;
      delete: (id: string) => void;
    };
  } | undefined;
  const db = {
    objectStoreNames: { contains: (_name: string) => true },
    onversionchange: null as (() => void) | null,
    close: () => { closes++; },
    transaction: (_stores: string[], mode: string) => {
      expect(mode).toBe("readwrite");
      metaRequest = { result: [], error: null, onsuccess: null, onerror: null };
      transaction = {
        error: null, oncomplete: null, onerror: null, onabort: null,
        abort: () => { aborts++; transaction?.onabort?.(); },
        objectStore: (_name: string) => ({
          getAll: () => metaRequest,
          get: (_id: string) => metaRequest,
          put: (..._args: unknown[]) => { puts++; },
          delete: (_id: string) => { deletions++; },
        }),
      };
      return transaction;
    },
  } as unknown as IDBDatabase;
  vi.stubGlobal("indexedDB", {
    open: () => {
      const request = {
        result: db, error: null,
        onupgradeneeded: null,
        onblocked: null as (() => void) | null,
        onerror: null,
        onsuccess: null as (() => void) | null,
      };
      openCallback = () => request.onsuccess?.();
      blockedCallback = () => request.onblocked?.();
      queueMicrotask(() => openCallback?.());
      return request;
    },
  });
  return {
    open: () => openCallback?.(),
    blocked: () => blockedCallback?.(),
    succeedGet: () => metaRequest?.onsuccess?.(),
    commit: () => transaction?.oncomplete?.(),
    get started() { return transaction !== undefined; },
    get closes() { return closes; },
    get aborts() { return aborts; },
    get puts() { return puts; },
    get deletions() { return deletions; },
    async waitUntilStarted() {
      for (let n = 0; n < 15 && !transaction; n++) await Promise.resolve();
      expect(transaction).toBeDefined();
    },
  };
}
const preview = new Blob(["regenerable"], { type: "video/webm" });

describe("optional preview writes cannot stall Android editor navigation", () => {
  it("commits a healthy preview exactly once without touching originals", async () => {
    const db = cacheDb();
    const pending = writeProxy("clip", preview);
    await db.waitUntilStarted();
    db.succeedGet();
    db.commit();
    await expect(pending).resolves.toBeUndefined();
    expect(db.puts).toBe(2);
    expect(db.deletions).toBe(0);
    expect(db.aborts).toBe(0);
    expect(db.closes).toBe(1);
  });

  it("aborts active preview writes when the editor is closed", async () => {
    const db = cacheDb();
    const controller = new AbortController();
    const pending = writeProxy("clip", preview, controller.signal);
    await db.waitUntilStarted();
    controller.abort();
    await expect(pending).rejects.toThrow("Proxy cancelled");
    expect(db.aborts).toBe(1);
    expect(db.puts).toBe(0);
    expect(db.closes).toBe(1);
  });

  it("does not leave a cache transaction alive after its seven-second deadline", async () => {
    vi.useFakeTimers();
    try {
      const db = cacheDb();
      const pending = writeProxy("clip", preview);
      await db.waitUntilStarted();
      const assertion = expect(pending).rejects.toThrow("Save proxy: timeout");
      await vi.advanceTimersByTimeAsync(7000);
      await assertion;
      expect(db.aborts).toBe(1);
      expect(db.closes).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("closes an obsolete cache connection that succeeded after onblocked", async () => {
    const db = cacheDb();
    const pending = readProxy("clip");
    db.blocked();
    await expect(pending).rejects.toThrow("Кэш предпросмотра занят");
    db.open();
    expect(db.started).toBe(false);
    expect(db.closes).toBe(1);
  });
});
