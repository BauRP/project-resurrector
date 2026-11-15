import { afterEach, describe, expect, it, vi } from "vitest";
import { saveEditorImportedClip } from "./editor-import-save";
import { readFileSync } from "node:fs";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fakeDatabase() {
  const stored: unknown[] = [];
  let closes = 0;
  let aborts = 0;
  let request!: {
    result: IDBDatabase;
    error: Error | null;
    onupgradeneeded: (() => void) | null;
    onblocked: (() => void) | null;
    onerror: (() => void) | null;
    onsuccess: (() => void) | null;
  };
  let transaction!: {
    error: Error | null;
    oncomplete: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
    objectStore: (name: string) => { put: (clip: unknown) => void };
    abort: () => void;
  };
  const db = {
    objectStoreNames: { contains: () => true },
    onversionchange: null as (() => void) | null,
    close: () => { closes++; },
    transaction: (_name: string, mode: string) => {
      expect(mode).toBe("readwrite");
      transaction = {
        error: null, oncomplete: null, onerror: null, onabort: null,
        objectStore: () => ({ put: (clip: unknown) => { stored.push(clip); } }),
        abort: () => { aborts++; transaction.onabort?.(); },
      };
      return transaction;
    },
  } as unknown as IDBDatabase;
  request = {
    result: db, error: null, onupgradeneeded: null, onblocked: null,
    onerror: null, onsuccess: null,
  };
  vi.stubGlobal("indexedDB", { open: () => request });
  return {
    request, stored,
    success: () => request.onsuccess?.(),
    complete: () => transaction.oncomplete?.(),
    blocked: () => request.onblocked?.(),
    abortTransaction: () => transaction.onabort?.(),
    get closes() { return closes; },
    get aborts() { return aborts; },
  };
}
const clip = { id: "clip-1", blob: new Blob(["original"], { type: "video/mp4" }) };

describe("Android editor imported video stays safe during IndexedDB failures", () => {
  it("resolves only after the transaction commits and retains the original Blob", async () => {
    const store = fakeDatabase();
    const saving = saveEditorImportedClip(clip);
    store.success();
    expect(store.stored).toEqual([clip]);
    store.complete();
    await expect(saving).resolves.toBeUndefined();
    expect(store.closes).toBe(1);
  });

  it("returns a real error when storage is blocked and closes late connections", async () => {
    const store = fakeDatabase();
    const saving = saveEditorImportedClip(clip);
    store.blocked();
    await expect(saving).rejects.toThrow("Медиатека занята");
    store.success();
    expect(store.stored).toHaveLength(0);
    expect(store.closes).toBe(1);
  });

  it("does not wait indefinitely on missing WebView callbacks", async () => {
    vi.useFakeTimers();
    const store = fakeDatabase();
    const saving = saveEditorImportedClip(clip);
    const assertion = expect(saving).rejects.toThrow("Сохранение клипа не подтвердилось");
    store.success();
    await vi.advanceTimersByTimeAsync(60000);
    await assertion;
    expect(store.aborts).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start writing if database open times out and succeeds late", async () => {
    vi.useFakeTimers();
    const store = fakeDatabase();
    const saving = saveEditorImportedClip(clip);
    const assertion = expect(saving).rejects.toThrow("Сохранение клипа не подтвердилось");
    await vi.advanceTimersByTimeAsync(60000);
    await assertion;
    store.success();
    expect(store.stored).toHaveLength(0);
    expect(store.closes).toBe(1);
  });

  it("keeps the original Editor import callsite and preserves put behavior", () => {
    const editor = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    const persistence = readFileSync("src/lib/editor-import-save.ts", "utf8");
    expect(editor).toContain("const saveClip = saveEditorImportedClip<StoredClip>");
    expect(persistence).toContain('tx.objectStore("clips").put(clip)');
    expect(persistence).not.toContain('tx.objectStore("clips").delete(');
  });
});
