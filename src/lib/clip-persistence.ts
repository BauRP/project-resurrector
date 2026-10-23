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
}
