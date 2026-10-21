import { bounded } from "./async";

// Derived previews only. Original media is never stored or deleted here.
export const analysisCache = new Map<string, { duration: number; peaks: number[] }>();
export const thumbCache = new Map<string, string[]>();
const CACHE_DB = "multicam-pov-preview-cache";
export async function previewCache(): Promise<IDBDatabase> {
  return bounded(new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("proxies");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  }), 4000, "Preview cache", (db) => db.close());
}
export async function readProxy(id: string): Promise<Blob | null> {
  const db = await previewCache();
  try { return await bounded(new Promise<Blob | null>((resolve, reject) => { const req = db.transaction("proxies").objectStore("proxies").get(id); req.onsuccess = () => resolve(req.result ?? null); req.onerror = () => reject(req.error); }), 4000, "Read proxy"); }
  finally { db.close(); }
}
export async function writeProxy(id: string, blob: Blob, signal?: AbortSignal): Promise<void> {
  const db = await previewCache();
  try { await bounded(new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("Proxy cancelled")); return; }
    const tx = db.transaction("proxies", "readwrite"); const abort = () => { try { tx.abort(); } catch { /* Already committed. */ } };
    signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => signal?.removeEventListener("abort", abort);
    tx.objectStore("proxies").put(blob, id);
    tx.oncomplete = () => { cleanup(); resolve(); };
    tx.onerror = () => { cleanup(); reject(tx.error); };
    tx.onabort = () => { cleanup(); reject(new Error("Proxy cancelled")); };
  }), 4000, "Save proxy"); }
  finally { db.close(); }
}
export async function cacheBytes(): Promise<number> {
  const db = await previewCache();
  try { return await bounded(new Promise<number>((resolve, reject) => { let bytes = 0; const req = db.transaction("proxies").objectStore("proxies").openCursor(); req.onsuccess = () => { const cursor = req.result; if (!cursor) { resolve(bytes); return; } bytes += (cursor.value as Blob).size; cursor.continue(); }; req.onerror = () => reject(req.error); }), 4000, "Measure cache"); }
  finally { db.close(); }
}
export async function clearPreviewCache(): Promise<number> {
  const db = await previewCache();
  try { await bounded(new Promise<void>((resolve, reject) => { const tx = db.transaction("proxies", "readwrite"); tx.objectStore("proxies").clear(); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }), 4000, "Clear previews"); }
  finally { db.close(); }
  analysisCache.clear(); thumbCache.clear();
  window.dispatchEvent(new Event("multicam-preview-cache-cleared"));
  return cacheBytes();
}