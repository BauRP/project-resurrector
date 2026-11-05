/**
 * Disk-backed MediaRecorder fallback for Android WebViews without OPFS.
 * Each timeslice is stored as its own IndexedDB Blob. Only Blob descriptors,
 * never whole recording ArrayBuffers, are loaded to compose the final file.
 *
 * Important: a transaction timeout is NOT proof it rolled back. We only
 * include keys whose oncomplete definitely arrived, avoiding duplicate bytes
 * when a late transaction eventually commits after fallback begins.
 */
export class RecordingIndexedChunks {
  private database: Promise<IDBDatabase> | null = null;
  private sequence = 0;
  private readonly confirmed: string[] = [];
  private readonly prefix: string;

  constructor(id: string) {
    this.prefix = id.replace(/[^a-zA-Z0-9_-]/g, "") + "-";
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === "undefined") {
        reject(new Error("IndexedDB is not available")); return;
      }
      let finished = false;
      const request = indexedDB.open("multicam-recording-spool-v1", 1);
      const finish = (db?: IDBDatabase, error?: Error) => {
        if (finished) { db?.close(); return; }
        finished = true;
        clearTimeout(timer);
        if (error) reject(error);
        else if (db) resolve(db);
        else reject(new Error("IndexedDB spool is unavailable"));
      };
      const timer = setTimeout(() => finish(undefined, new Error("IndexedDB spool opening timed out")), 6000);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("pieces"))
          request.result.createObjectStore("pieces");
      };
      request.onerror = () => finish(undefined, request.error ?? new Error("IndexedDB spool open failed"));
      request.onblocked = () => finish(undefined, new Error("IndexedDB spool is blocked"));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        finish(db);
      };
    });
    return this.database;
  }

  async append(chunk: Blob): Promise<void> {
    const db = await this.open();
    const key = this.prefix + String(++this.sequence).padStart(10, "0");
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pieces", "readwrite");
      let finished = false;
      const complete = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) reject(error);
        else { this.confirmed.push(key); resolve(); }
      };
      const timer = setTimeout(() => {
        try { tx.abort(); } catch { /* Already committed or closed */ }
        complete(new Error("IndexedDB spool write timed out"));
      }, 8000);
      tx.oncomplete = () => complete();
      tx.onabort = () => complete(tx.error ?? new Error("IndexedDB spool write aborted"));
      tx.onerror = () => { /* onabort owns the failure */ };
      try { tx.objectStore("pieces").put(chunk, key); }
      catch (error) { complete(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  async materialize(): Promise<Blob[]> {
    if (!this.confirmed.length) return [];
    const db = await this.open();
    const keys = [...this.confirmed];
    return new Promise<Blob[]>((resolve, reject) => {
      const tx = db.transaction("pieces", "readonly");
      const parts: Array<Blob | undefined> = new Array(keys.length);
      let finished = false;
      const complete = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) { reject(error); return; }
        if (parts.some(part => !(part instanceof Blob))) {
          reject(new Error("Recorded chunk is missing from private storage")); return;
        }
        resolve(parts as Blob[]);
      };
      const timer = setTimeout(() => {
        try { tx.abort(); } catch { /* Already finished */ }
        complete(new Error("Recorded chunks read-back timed out"));
      }, 12000);
      tx.oncomplete = () => complete();
      tx.onabort = () => complete(tx.error ?? new Error("Recorded chunks read-back aborted"));
      tx.onerror = () => { /* onabort owns the failure */ };
      try {
        const store = tx.objectStore("pieces");
        for (let i = 0; i < keys.length; i++) {
          const req = store.get(keys[i]!);
          req.onsuccess = () => { parts[i] = req.result instanceof Blob ? req.result : undefined; };
        }
      } catch (error) { complete(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  async clearAfterSave(): Promise<void> {
    if (!this.confirmed.length) return;
    const db = await this.open();
    const keys = [...this.confirmed];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("pieces", "readwrite");
      let finished = false;
      const done = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      // Cleanup must not keep the whole dual-camera save promise pending.
      // Once clips are confirmed in the durable library, abandoned staging
      // pieces are safer than a permanently blocked Camera UI.
      const timer = setTimeout(() => {
        try { tx.abort(); } catch { /* Already finished */ }
        done(new Error("Timed out cleaning temporary recording pieces"));
      }, 8000);
      tx.oncomplete = () => done();
      tx.onabort = () => done(tx.error ?? new Error("Cannot remove saved staging chunks"));
      try {
        const store = tx.objectStore("pieces");
        for (const key of keys) store.delete(key);
      } catch (error) { done(error instanceof Error ? error : new Error(String(error))); }
    });
    this.confirmed.length = 0;
  }
}
