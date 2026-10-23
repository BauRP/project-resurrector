/**
 * Confirmation of recorded-clip persistence. This file intentionally does not clear
 * temporary buffers and never deletes existing user clips on failure.
 */
export interface RecordedClip {
  id: string; createdAt: number; camera: number; mode: string;
  profile: string; playbackRate: number; blob: Blob;
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
    const request = indexedDB.open("multicam-pov-media", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("clips")) {
        request.result.createObjectStore("clips", { keyPath: "id" });
      }
    };
    request.onerror = () => reject(new Error("Не удалось открыть медиатеку"));
    request.onblocked = () => reject(new Error("Хранилище занято другой вкладкой"));
    request.onsuccess = () => {
      const db = request.result;
      let closed = false;
      const close = () => { if (!closed) { closed = true; db.close(); } };
      try {
        const tx = db.transaction("clips", "readwrite");
        tx.oncomplete = () => { close(); resolve(); };
        tx.onabort = () => { close(); reject(new Error("Сохранение прервано: проверьте место на устройстве")); };
        tx.onerror = () => { close(); reject(new Error("Ошибка записи видео в хранилище")); };
        const objectStore = tx.objectStore("clips");
        for (const clip of clips) objectStore.put(clip);
      } catch (error) { close(); reject(error); }
    };
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

export async function assertSavedClipsReadable(clips: readonly RecordedClip[]): Promise<void> {
  if (!clips.length) throw new Error("Не указан сохранённый клип");
  if (typeof indexedDB === "undefined") throw new Error("Локальное хранилище недоступно");
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("multicam-pov-media", 1);
    request.onblocked = () => reject(new Error("Не удалось проверить сохранение: база занята"));
    request.onerror = () => reject(new Error("Не удалось повторно открыть сохранённую медиатеку"));
    request.onsuccess = () => {
      const db = request.result;
      let finished = false;
      const fail = (message: string) => {
        if (finished) return;
        finished = true;
        db.close();
        reject(new Error(message));
      };
      if (!db.objectStoreNames.contains("clips")) {
        fail("Медиатека не содержит сохранённых видео");
        return;
      }
      try {
        const tx = db.transaction("clips", "readonly");
        const store = tx.objectStore("clips");
        let failure = "";
        for (const clip of clips) {
          const read = store.get(clip.id);
          read.onsuccess = () => {
            if (!persistedClipMatches(clip, read.result))
              failure = "Файл " + clip.id + " отсутствует или повреждён в хранилище";
          };
          read.onerror = () => { failure = "Не удалось прочитать файл " + clip.id; };
        }
        tx.oncomplete = () => {
          if (finished) return;
          finished = true;
          db.close();
          if (failure) reject(new Error(failure)); else resolve();
        };
        tx.onabort = () => fail("Проверка записанного видео прервана");
        tx.onerror = () => fail("Ошибка чтения сохранённого видео");
      } catch (error) {
        fail("Не удалось проверить записанные клипы: " + String(error));
      }
    };
  });
}
