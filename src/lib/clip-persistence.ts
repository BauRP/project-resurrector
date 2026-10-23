/**
 * Confirmation of recorded-clip persistence. This file intentionally does not clear
 * temporary buffers and never deletes existing user clips on failure.
 */
export interface RecordedClip {
  id: string; createdAt: number; camera: number; mode: string;
  profile: string; playbackRate: number; blob: Blob;
}
export async function saveRecordedClip(clip: RecordedClip): Promise<void> {
  if (!clip.blob || clip.blob.size < 100) throw new Error("Запись пуста: видео не сохранено");
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
        tx.objectStore("clips").put(clip);
      } catch (error) { close(); reject(error); }
    };
  });
}
