/**
 * Abort the actual IndexedDB read transaction when an Editor is closed or a
 * clip request times out. A Promise.race timeout alone leaves IndexedDB
 * copying a large Blob that nobody will use after navigation.
 * Read-only transactions never modify recorded clips or project metadata.
 */
const READ_TIMEOUT_MS = 4500;

function readClipStore<T>(
  db: IDBDatabase,
  createRequest: (store: IDBObjectStore) => IDBRequest,
  convert: (value: unknown) => T,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(new Error("Editor clip read cancelled"));
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction;
    let request: IDBRequest;
    try {
      tx = db.transaction("clips", "readonly");
      request = createRequest(tx.objectStore("clips"));
    } catch (error) { reject(error); return; }

    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (timer !== null) clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      request.onsuccess = null;
      request.onerror = null;
      tx.onerror = null;
      tx.onabort = null;
    };
    const finish = (result?: T, error?: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error !== undefined) reject(error);
      else resolve(result as T);
    };
    const cancel = (reason: string) => {
      finish(undefined, new Error(reason));
      try { tx.abort(); } catch { /* Transaction already ended or closing. */ }
    };
    const onAbort = () => cancel("Editor clip read cancelled");
    request.onsuccess = () => {
      try { finish(convert(request.result)); }
      catch (error) { finish(undefined, error); }
    };
    request.onerror = () => finish(undefined, request.error ?? new Error("Editor clip read failed"));
    tx.onerror = () => finish(undefined, tx.error ?? new Error("Editor clip transaction failed"));
    tx.onabort = () => finish(undefined, tx.error ?? new Error("Editor clip transaction aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => cancel("Editor clip read timed out"), READ_TIMEOUT_MS);
    if (signal?.aborted) onAbort();
  });
}

/** Return only valid media keys, keeping the same order as the old library. */
export function readEditorClipIds(db: IDBDatabase, signal?: AbortSignal): Promise<string[]> {
  return readClipStore(db, store => store.getAllKeys(), value =>
    (value as IDBValidKey[]).filter((id): id is string => typeof id === "string"), signal);
}

/** Read just the requested recorded clip; cancel the read on editor unmount. */
export function readEditorClip<T>(db: IDBDatabase, id: string, signal?: AbortSignal): Promise<T | null> {
  return readClipStore(db, store => store.get(id), value => (value as T | undefined) ?? null, signal);
}
