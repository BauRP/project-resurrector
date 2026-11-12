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
    return await bounded(new Promise<SavedProjectSnapshot | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      let value: unknown = null;
      req.onsuccess = () => { value = req.result as unknown; };
      tx.oncomplete = () => resolve(validSnapshot(value));
      tx.onerror = () => reject(tx.error ?? new Error("Project load failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Project load aborted"));
    }), 5000, "Read project state");
  } finally { db.close(); }
}

/** Resolve only after IndexedDB transaction completes, not on request success. */
export async function writeAsyncProjectSnapshot(value: SavedProjectSnapshot): Promise<void> {
  const db = await openProjectDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Project save failed"));
      tx.onabort = () => reject(tx.error ?? new Error("Project save aborted"));
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
