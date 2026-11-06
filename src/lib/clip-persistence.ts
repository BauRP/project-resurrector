/**
 * Confirmation of recorded-clip persistence. This file intentionally does not clear
 * temporary buffers and never deletes existing user clips on failure.
 */
export interface RecordedClip {
  id: string; createdAt: number; camera: number; mode: string;
  profile: string; playbackRate: number; blob: Blob;
  captureGroupId?: string;
  cameraDeviceId?: string;
  monotonicStartMs?: number;
  synchronizationVerified?: false;
  foldTransitions?: import("./fold-recording-evidence").FoldTransitionEvidence[];
  foldContinuityVerified?: false;
}
export async function saveRecordedClip(clip: RecordedClip): Promise<void> {
  return saveRecordedClipsAtomically([clip]);
}

/** All-or-nothing persistence of related camera recordings in one transaction. */
export async function saveRecordedClipsAtomically(clips: readonly RecordedClip[]): Promise<void> {
  if (!clips.length) throw new Error("Нет файлов для сохранения");
  if (new Set(clips.map(c => c.id)).size !== clips.length) throw new Error("Повторяющиеся идентификаторы клипов");
  for (const clip of clips) {
    if (!clip.blob || clip.blob.size < 1024) throw new Error("Запись пуста: видео не сохранено");
  }
  if (typeof indexedDB === "undefined") throw new Error("Локальное хранилище недоступно");
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let db: IDBDatabase | null = null;
    let tx: IDBTransaction | null = null;
    const settle = (error?: unknown) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      try { db?.close(); } catch { /* A stopped WebView may close the DB. */ }
      if (error) reject(error); else resolve();
    };
    // A lost IndexedDB callback cannot hold the Camera screen in "saving".
    // A timeout is NOT proof of rollback: do not replay or delete the clip.
    const timeout = window.setTimeout(() => {
      try { tx?.abort(); } catch { /* Commit may already have completed. */ }
      settle(new Error("Сохранение видео не подтверждено. Проверьте медиатеку перед повторной записью."));
    }, 12000);
    try {
      const request = indexedDB.open("multicam-pov-media", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("clips")) {
          request.result.createObjectStore("clips", { keyPath: "id" });
        }
      };
      request.onerror = () => settle(new Error("Не удалось открыть медиатеку"));
      request.onblocked = () => settle(new Error("Хранилище занято другой вкладкой"));
      request.onsuccess = () => {
        if (finished) { request.result.close(); return; }
        db = request.result;
        db.onversionchange = () => db?.close();
        try {
          tx = db.transaction("clips", "readwrite");
          tx.oncomplete = () => settle();
          tx.onabort = () => {
            const conflict = tx?.error?.name === "ConstraintError";
            settle(new Error(conflict
              ? "Клип с таким идентификатором уже существует: исходная запись не изменена"
              : "Сохранение прервано: проверьте место на устройстве"));
          };
          tx.onerror = () => {
            // Wait for onabort: failed writes are atomic, never use put().
          };
          const store = tx.objectStore("clips");
          for (const clip of clips) store.add(clip);
        } catch (error) { settle(error); }
      };
    } catch (error) { settle(error); }
  });
  // IDB transaction.oncomplete confirms a write, but not that a media blob
  // can be fetched later. Verify each saved record with a fresh transaction.
  // Never delete user clips if this diagnostic read-back fails.
  await assertSavedClipsReadable(clips);
}

/** Verifies identity and immutable blob metadata read from IndexedDB. A valid
 * container or decoded video frame is a SEPARATE check, not claimed here.
 */
export function persistedClipMatches(expected: Pick<RecordedClip, "id" | "blob">, stored: unknown): boolean {
  if (!stored || typeof stored !== "object") return false;
  const record = stored as Partial<RecordedClip>;
  return record.id === expected.id && record.blob instanceof Blob &&
    record.blob.size >= 1024 && record.blob.size === expected.blob.size &&
    record.blob.type === expected.blob.type;
}

/** Bounded low-memory comparison of beginning, middle and end of persisted blobs.
 * Checks sampled bytes, NOT every frame, codec integrity or a full-file hash.
 */
/** Read only small slices; old WebViews and jsdom may omit Blob.arrayBuffer. */
function readBlobSample(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("Невозможно прочитать образец видео"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Ошибка чтения образца видео"));
    reader.readAsArrayBuffer(blob);
  });
}
export async function sampledClipBytesMatch(original: Blob, stored: Blob): Promise<boolean> {
  if (original.size !== stored.size || original.type !== stored.type) return false;
  const span = 1024;
  const positions = [...new Set([0, Math.max(0, Math.floor(original.size / 2) - Math.floor(span / 2)),
    Math.max(0, original.size - span)])];
  for (const at of positions) {
    const [left, right] = await Promise.all([
      readBlobSample(original.slice(at, at + span)),
      readBlobSample(stored.slice(at, at + span)),
    ]);
    const a = new Uint8Array(left), b = new Uint8Array(right);
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  }
  return true;
}

export async function assertSavedClipsReadable(clips: readonly RecordedClip[]): Promise<void> {
  if (!clips.length) throw new Error("Не указан сохранённый клип");
  if (typeof indexedDB === "undefined") throw new Error("Локальное хранилище недоступно");
  await new Promise<void>((resolve, reject) => {
    let finished = false;
    let db: IDBDatabase | null = null;
    let tx: IDBTransaction | null = null;
    const settle = (error?: unknown) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      try { db?.close(); } catch { /* The Activity is being torn down. */ }
      if (error) reject(error); else resolve();
    };
    // The write may have already committed. A verification timeout must
    // NEVER delete, repeat or replace an existing user recording.
    const timer = window.setTimeout(() => {
      try { tx?.abort(); } catch { /* Read transaction already completed. */ }
      settle(new Error("Проверка видео не ответила вовремя. Запись не удалена, проверьте медиатеку."));
    }, 12000);
    try {
      const request = indexedDB.open("multicam-pov-media", 1);
      request.onblocked = () => settle(new Error("Не удалось проверить сохранение: база занята"));
      request.onerror = () => settle(new Error("Не удалось повторно открыть сохранённую медиатеку"));
      request.onsuccess = () => {
        if (finished) { request.result.close(); return; }
        db = request.result;
        db.onversionchange = () => db?.close();
        if (!db.objectStoreNames.contains("clips")) {
          settle(new Error("Медиатека не содержит сохранённых видео"));
          return;
        }
        try {
          tx = db.transaction("clips", "readonly");
          const store = tx.objectStore("clips");
          let failure = "";
          const checkBytes: { expected: Blob; stored: Blob; id: string }[] = [];
          for (const clip of clips) {
            const read = store.get(clip.id);
            read.onsuccess = () => {
              if (finished) return;
              if (!persistedClipMatches(clip, read.result))
                failure = "Файл " + clip.id + " отсутствует или повреждён в хранилище";
              else checkBytes.push({ expected: clip.blob, stored: (read.result as RecordedClip).blob, id: clip.id });
            };
            read.onerror = () => { failure = "Не удалось прочитать файл " + clip.id; };
          }
          tx.oncomplete = () => {
            if (finished) return;
            // The IndexedDB transaction must finish before asynchronous
            // Blob sample reads. Keep the same deadline through both stages.
            if (failure) { settle(new Error(failure)); return; }
            void Promise.all(checkBytes.map(async sample => {
              if (!await sampledClipBytesMatch(sample.expected, sample.stored))
                throw new Error("Сохранённый видеоклип " + sample.id + " отличается от исходных данных");
            })).then(() => settle(), error => settle(error));
          };
          tx.onabort = () => settle(new Error("Проверка записанного видео прервана"));
          tx.onerror = () => settle(new Error("Ошибка чтения сохранённого видео"));
        } catch (error) {
          settle(new Error("Не удалось проверить записанные клипы: " + String(error)));
        }
      };
    } catch (error) { settle(error); }
  });
}

/** Reopen the durable store and return the ORIGINAL persisted media bytes.
 * Never substitute the in-memory MediaRecorder blob for the file under test.
 */
export async function readPersistedClip(clipId: string): Promise<RecordedClip> {
  if (!clipId) throw new Error("Не указан идентификатор сохранённого видео");
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB недоступна");
  return new Promise<RecordedClip>((resolve, reject) => {
    let finished = false;
    let db: IDBDatabase | null = null;
    let tx: IDBTransaction | null = null;
    const settle = (clip?: RecordedClip, error?: unknown) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      try { db?.close(); } catch { /* Activity recreation. */ }
      if (error) reject(error); else if (clip) resolve(clip);
      else reject(new Error("Сохранённый видеоклип не найден"));
    };
    const timer = window.setTimeout(() => {
      try { tx?.abort(); } catch { /* Read-only transaction may already be finished. */ }
      settle(undefined, new Error("Чтение видео слишком долго не отвечает. Исходный файл не изменён."));
    }, 12000);
    try {
      const request = indexedDB.open("multicam-pov-media", 1);
      request.onblocked = () => settle(undefined, new Error("Медиатека заблокирована"));
      request.onerror = () => settle(undefined, new Error("Не удалось открыть хранилище для проверки клипа"));
      request.onsuccess = () => {
        if (finished) { request.result.close(); return; }
        db = request.result;
        db.onversionchange = () => db?.close();
        if (!db.objectStoreNames.contains("clips")) {
          settle(undefined, new Error("Сохранённые видео не найдены"));
          return;
        }
        try {
          tx = db.transaction("clips", "readonly");
          const result = tx.objectStore("clips").get(clipId);
          let clip: RecordedClip | null = null;
          let failed = "";
          result.onsuccess = () => {
            if (finished) return;
            const stored: unknown = result.result;
            if (!stored || typeof stored !== "object" ||
                (stored as RecordedClip).id !== clipId ||
                !((stored as RecordedClip).blob instanceof Blob) ||
                (stored as RecordedClip).blob.size < 1024) {
              failed = "Сохранённый видеоклип отсутствует или повреждён"; return;
            }
            clip = stored as RecordedClip;
          };
          result.onerror = () => { failed = "Ошибка чтения видеоклипа"; };
          tx.oncomplete = () => {
            if (failed || !clip) settle(undefined, new Error(failed || "Файл не прочитан"));
            else settle(clip);
          };
          tx.onabort = () => settle(undefined, new Error("Чтение видеоклипа прервано"));
          tx.onerror = () => settle(undefined, new Error("Ошибка транзакции чтения клипа"));
        } catch (error) { settle(undefined, error); }
      };
    } catch (error) { settle(undefined, error); }
  });
}
