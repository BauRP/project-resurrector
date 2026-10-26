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


export interface PlaybackFrameSample {
  presentationTimeMs: number;
  presentedFrames: number;
}
export interface VideoFrameRateEvidence {
  approximateFps: number | null;
  observedFrames: number;
  sampledDurationMs: number;
  status: "sampled" | "unavailable";
  limitation: string;
}
/** Video playback sampling measures presented frames, not necessarily encoded
 * frames. Browser throttling, dropped frames or playback speed can change it.
 */
export function summarizePresentedFrames(samples: readonly PlaybackFrameSample[]): VideoFrameRateEvidence {
  const ordered = [...samples].filter(x => Number.isFinite(x.presentationTimeMs) &&
    Number.isFinite(x.presentedFrames)).sort((a,b) => a.presentationTimeMs-b.presentationTimeMs);
  const first = ordered[0], last = ordered[ordered.length-1];
  const duration = first && last ? last.presentationTimeMs - first.presentationTimeMs : 0;
  const frames = first && last ? last.presentedFrames - first.presentedFrames : 0;
  const sufficient = ordered.length >= 5 && duration >= 350 && frames >= 3;
  return {
    approximateFps: sufficient ? Math.round((frames * 1000 / duration) * 10) / 10 : null,
    observedFrames: Math.max(0, frames),
    sampledDurationMs: Math.max(0, Math.round(duration)),
    status: sufficient ? "sampled" : "unavailable",
    limitation: "Оценка FPS по показанным WebView кадрам; не частота кадров кодека. Пропуски/троттлинг возможны.",
  };
}
/** A decoded first frame alone is insufficient to detect a prematurely
 * truncated recording. Compare the browser-reported file duration with the
 * MONOTONIC time between actual MediaRecorder start and stop requests.
 *
 * This check is deliberately conservative. WebM duration may be unavailable,
 * short recordings have coarse timestamps, and pause/time-lapse/speed changes
 * must not be passed as ordinary real-time sessions. A matching duration does
 * NOT verify encoded FPS, every frame, audio, or fold-time continuity.
 */
export type SavedDurationStatus = "consistent" | "short" | "unknown";
export interface SavedDurationEvidence {
  status: SavedDurationStatus;
  expectedMs: number | null;
  fileMs: number | null;
  message: string;
}
export function assessSavedVideoDuration(
  expectedMs: number | null | undefined, fileSeconds: number | null | undefined,
): SavedDurationEvidence {
  const validExpected = typeof expectedMs === "number" && Number.isFinite(expectedMs) &&
    expectedMs > 0 && expectedMs <= 24 * 60 * 60 * 1000;
  const validFile = typeof fileSeconds === "number" && Number.isFinite(fileSeconds) &&
    fileSeconds > 0 && fileSeconds <= 24 * 60 * 60;
  const expected = validExpected ? expectedMs! : null;
  const file = validFile ? fileSeconds! * 1000 : null;
  if (expected === null || file === null || expected < 10000) {
    return { status: "unknown", expectedMs: expected, fileMs: file,
      message: "Сравнение длительности недоступно или запись слишком короткая; целостность кадров не подтверждена." };
  }
  const slack = Math.max(4000, Math.min(15000, expected * 0.18));
  if (expected - file > slack) {
    return { status: "short", expectedMs: expected, fileMs: file,
      message: "Длительность сохранённого видео существенно короче времени записи; возможна потеря конца файла." };
  }
  if (file - expected > Math.max(5000, expected * 0.5)) {
    return { status: "unknown", expectedMs: expected, fileMs: file,
      message: "Длительность файла не соответствует обычной скорости записи; целостность не подтверждена." };
  }
  return { status: "consistent", expectedMs: expected, fileMs: file,
    message: "Длительность видео примерно соответствует времени записи; проверка всех кадров и FPS кодека не выполнена." };
}

/** Conservative bounded measurement; never mark the encoded FPS as verified. */
export async function sampleStoredClipDisplayedFps(
  clipId: string,
  maxSamplingMs = 3500,
): Promise<VideoFrameRateEvidence> {
  const clip = await readPersistedClip(clipId);
  const video = document.createElement("video");
  if (!("requestVideoFrameCallback" in video)) return summarizePresentedFrames([]);
  const frameVideo = video as HTMLVideoElement & {
    requestVideoFrameCallback(callback: (now: number, metadata: { mediaTime: number; presentedFrames: number }) => void): number;
    cancelVideoFrameCallback(handle: number): void;
  };
  const url = URL.createObjectURL(clip.blob);
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  video.muted = true; video.playsInline = true;
  container.appendChild(video); document.body.appendChild(container);
  const observations: PlaybackFrameSample[] = [];
  let handle = 0;
  try {
    return await new Promise<VideoFrameRateEvidence>(resolve => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true; clearTimeout(timer);
        if (handle) frameVideo.cancelVideoFrameCallback(handle);
        resolve(summarizePresentedFrames(observations));
      };
      const tick = (_now: number, metadata: { mediaTime: number; presentedFrames: number }) => {
        if (done) return;
        observations.push({ presentationTimeMs: metadata.mediaTime * 1000, presentedFrames: metadata.presentedFrames });
        if (observations.length >= 110) { finish(); return; }
        handle = frameVideo.requestVideoFrameCallback(tick);
      };
      const timer = window.setTimeout(finish, Math.max(1000, Math.min(5500, maxSamplingMs)));
      video.onended = finish;
      video.onerror = finish;
      handle = frameVideo.requestVideoFrameCallback(tick);
      video.src = url;
      void video.play().catch(finish);
    });
  } finally {
    video.pause();
    video.removeAttribute("src"); video.load();
    container.remove(); URL.revokeObjectURL(url);
  }
}
