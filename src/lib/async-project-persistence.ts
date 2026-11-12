import { bounded } from "./async";

/** Durable, asynchronous Android project-state store.
 * Distinct from media/proxy databases. Never delete or migrate user clips.
 * A last-wins queue keeps at most one transaction and one pending snapshot,
 * even when an OEM WebView IndexedDB operation never completes.
 */
export interface SavedProjectSnapshot {
  savedAt: number;
  state: Record<string, unknown>;
}
const DB = "multicam-pov-project-state-v1";
const STORE = "snapshots";
const KEY = "latest";

function openProjectDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  return bounded(new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onblocked = () => reject(new Error("Project state database blocked"));
    request.onerror = () => reject(request.error ?? new Error("Project state database failed"));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  }), 5000, "Open project state", db => db.close());
}

function validSnapshot(raw: unknown): SavedProjectSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Partial<SavedProjectSnapshot>;
  if (typeof v.savedAt !== "number" || !Number.isSafeInteger(v.savedAt) ||
      v.savedAt < 0 || !v.state || typeof v.state !== "object" || Array.isArray(v.state)) return null;
  return { savedAt: v.savedAt, state: v.state };
}

export async function readAsyncProjectSnapshot(): Promise<SavedProjectSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openProjectDb();
  try {
    return await new Promise<SavedProjectSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      let value: unknown = null;
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        if (error) reject(error);
        else resolve(validSnapshot(value));
      };
      // A rejected JavaScript Promise does not stop an IndexedDB operation.
      // Abort the real native transaction when a WebView backend stalls,
      // otherwise old reads can pile up behind new project saves.
      const watchdog = setTimeout(() => {
        try { tx.abort(); } catch { /* The transaction may already be inactive. */ }
        finish(new Error("Project read timed out"));
      }, 5000);
      tx.oncomplete = () => finish();
      tx.onerror = () => finish(tx.error ?? new Error("Project load failed"));
      tx.onabort = () => finish(tx.error ?? new Error("Project load aborted"));
      try {
        const req = tx.objectStore(STORE).get(KEY);
        req.onsuccess = () => { value = req.result as unknown; };
        req.onerror = () => finish(req.error ?? new Error("Project read failed"));
      } catch (error) {
        try { tx.abort(); } catch { /* Invalid or already finished transaction. */ }
        finish(error instanceof Error ? error : new Error("Project read failed"));
      }
    });
  } finally { db.close(); }
}

/** Resolve only after IndexedDB transaction completes, not on request success. */
export async function writeAsyncProjectSnapshot(value: SavedProjectSnapshot): Promise<void> {
  const db = await openProjectDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(watchdog);
        if (error) reject(error);
        else resolve();
      };
      // IndexedDB request success is NOT a durable commit. Wait for the
      // transaction itself, and abort a stuck OEM WebView transaction after
      // seven seconds so the last-wins queue can recover and use the legacy
      // backup instead of remaining blocked forever.
      const watchdog = setTimeout(() => {
        try { tx.abort(); } catch { /* Already completed or no longer active. */ }
        finish(new Error("Project save timed out"));
      }, 7000);
      tx.oncomplete = () => finish();
      tx.onerror = () => finish(tx.error ?? new Error("Project save failed"));
      tx.onabort = () => finish(tx.error ?? new Error("Project save aborted"));
      try { tx.objectStore(STORE).put(value, KEY); }
      catch (error) {
        finish(error instanceof Error ? error : new Error("Project save failed"));
      }
    });
  } finally { db.close(); }
}

export function createLatestProjectWriter<T>(write: (value:T)=>Promise<void>) {
  let queued: T | null = null;
  let running = false;
  let closed = false;
  const pump = async () => {
    if (running || closed || queued === null) return;
    running = true;
    try {
      while (!closed && queued !== null) {
        const snapshot = queued;
        queued = null;
        try { await write(snapshot); } catch { /* Caller handles fallback. */ }
      }
    } finally { running = false; }
  };
  return {
    enqueue(value:T) {
      if (closed) return;
      queued = value;
      void pump();
    },
    close() { closed = true; queued = null; },
  };
}
