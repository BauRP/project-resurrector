/** Import-only persistence. Unlike Camera2 recording, the Editor uses put()
 * so reimporting an existing file can update its own record. Keep that
 * behavior: never silently change put() to add() or remove a clip on failure.
 *
 * Android WebView may lose IDB callbacks after Activity recreation. The timer
 * only ends our wait and tries to cancel an unfinished transaction. A timeout
 * does NOT prove the record was rolled back or saved. Never retry automatically.
 */
const EDITOR_IMPORT_SAVE_TIMEOUT_MS = 60000;

export function saveEditorImportedClip<T extends { id: string; blob: Blob }>(clip: T): Promise<void> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("Медиатека недоступна"));
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let db: IDBDatabase | null = null;
    let tx: IDBTransaction | null = null;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      try { db?.close(); } catch { /* WebView already closed it. */ }
      if (error !== undefined) reject(error);
      else resolve();
    };
    const watchdog = setTimeout(() => {
      // On timeout, the transaction might have just committed. Don't claim
      // rollback or retry the same original automatically. Settle with the
      // accurate timeout reason BEFORE abort triggers an OEM onabort callback.
      finish(new Error("Сохранение клипа не подтвердилось. Проверьте медиатеку перед повторным импортом."));
      try { tx?.abort(); } catch { /* Already committed or unavailable. */ }
    }, EDITOR_IMPORT_SAVE_TIMEOUT_MS);
    try {
      const request = indexedDB.open("multicam-pov-media", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("clips"))
          request.result.createObjectStore("clips", { keyPath: "id" });
      };
      request.onblocked = () => finish(new Error("Медиатека занята. Повторите импорт позже."));
      request.onerror = () => finish(request.error ?? new Error("Не удалось открыть медиатеку"));
      request.onsuccess = () => {
        // A blocked or timed-out open may succeed after the Editor unmounted.
        if (settled) { request.result.close(); return; }
        db = request.result;
        db.onversionchange = () => db?.close();
        try {
          tx = db.transaction("clips", "readwrite");
          tx.oncomplete = () => finish();
          tx.onerror = () => {
            // IndexedDB will fire abort; do not announce success on error.
          };
          tx.onabort = () => finish(tx?.error ?? new Error("Запись клипа прервана"));
          tx.objectStore("clips").put(clip);
        } catch (error) {
          try { tx?.abort(); } catch { /* Closing failed transaction. */ }
          finish(error);
        }
      };
    } catch (error) { finish(error); }
  });
}
