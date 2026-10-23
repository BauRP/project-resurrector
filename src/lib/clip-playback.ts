import { readPersistedClip } from "./clip-persistence";

export interface DecodedVideoEvidence {
  width: number;
  height: number;
  durationSeconds: number | null;
  verifiedFirstFrame: true;
  /** No actual output FPS, frame-by-frame fidelity, HDR or audio quality is inferred. */
  source: "html-video-loadeddata";
}

/** Metadata alone is insufficient. loadeddata plus HAVE_CURRENT_DATA means
 * the browser loaded the first frame of the encoded media. This does NOT prove
 * that other frames, playback FPS, synchronization or stabilization are correct.
 */
export function isDecodedFirstFrame(readyState: number, width: number, height: number): boolean {
  return readyState >= 2 && Number.isFinite(width) && width > 0 &&
    Number.isFinite(height) && height > 0;
}

export async function verifyDecodedVideoBlob(
  blob: Blob,
  signal?: AbortSignal,
  timeoutMs = 8500,
): Promise<DecodedVideoEvidence> {
  if (blob.size < 1024) throw new Error("Видеофайл пуст");
  if (signal?.aborted) throw new Error("Проверка декодирования отменена");
  if (typeof document === "undefined") throw new Error("Видеодекодер WebView недоступен");
  return new Promise<DecodedVideoEvidence>((resolve, reject) => {
    const video = document.createElement("video");
    const source = URL.createObjectURL(blob);
    let completed = false;
    const container = document.createElement("div");
    // On Android, detached or display:none videos can avoid decoding. Use a
    // 1px offscreen element; it never covers live camera controls.
    container.setAttribute("aria-hidden", "true");
    container.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;opacity:0";
    video.style.cssText = "width:1px;height:1px";
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    container.appendChild(video);
    const finish = (error?: Error, evidence?: DecodedVideoEvidence) => {
      if (completed) return;
      completed = true;
      window.clearTimeout(guard);
      signal?.removeEventListener("abort", aborted);
      video.onloadeddata = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      container.remove();
      URL.revokeObjectURL(source);
      if (error) reject(error);
      else if (evidence) resolve(evidence);
      else reject(new Error("Кадр не декодирован"));
    };
    const aborted = () => finish(new Error("Проверка видеоклипа отменена"));
    const guard = window.setTimeout(() => finish(new Error("Тайм-аут декодирования первого кадра")), timeoutMs);
    signal?.addEventListener("abort", aborted, { once: true });
    video.onloadeddata = () => {
      if (!isDecodedFirstFrame(video.readyState, video.videoWidth, video.videoHeight)) {
        finish(new Error("Декодированный видеокадр имеет недопустимый размер"));
        return;
      }
      finish(undefined, {
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) && video.duration >= 0 ? video.duration : null,
        verifiedFirstFrame: true,
        source: "html-video-loadeddata",
      });
    };
    video.onerror = () => finish(new Error("WebView не смог декодировать сохранённый видеоклип"));
    try {
      document.body.appendChild(container);
      video.src = source;
      video.load();
      // Metadata/load alone is not success; wait for an actual loaded frame.
      // Muted playback helps some WebView decoders start decoding.
      void video.play().catch(() => { /* loadeddata may still arrive without autoplay */ });
    } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
  });
}

export async function verifyStoredClipPlayback(clipId: string): Promise<DecodedVideoEvidence> {
  const clip = await readPersistedClip(clipId);
  return verifyDecodedVideoBlob(clip.blob);
}
