import { cameraController } from "./camera-controller";
import { recordModeEvidence, type ModeEvidence } from "./camera-passport";
export interface TestMode { width: number; height: number; fps: number }
export const TEST_MODES: readonly TestMode[] = [
  { width: 1280, height: 720, fps: 30 },
  { width: 1920, height: 1080, fps: 30 },
  { width: 1920, height: 1080, fps: 60 },
  { width: 2560, height: 1440, fps: 30 },
  { width: 3840, height: 2160, fps: 30 },
  { width: 3840, height: 2160, fps: 60 },
];
const MIMES = ["video/webm;codecs=vp8,opus","video/webm;codecs=vp9,opus","video/webm","video/mp4;codecs=avc1"];

/** One bounded, actual encoded sample; no fabricated tests or fake FPS claims. */
async function recordSample(stream: MediaStream, signal: AbortSignal): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder недоступен");
  const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("Подходящий видеокодировщик отсутствует");
  return new Promise<Blob>((resolve, reject) => {
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mime }); } catch (e) { reject(e); return; }
    const chunks: Blob[] = [];
    let done = false, endTimer = 0, guard = 0;
    const finish = (failure?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(endTimer); clearTimeout(guard);
      signal.removeEventListener("abort", abort);
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (failure) reject(failure);
      else resolve(new Blob(chunks, { type: mime }));
    };
    const abort = () => {
      if (recorder.state !== "inactive") { try { recorder.stop(); } catch { /* already stopped */ } }
      finish(new Error("Остановлено"));
    };
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => finish();
    recorder.onerror = () => finish(new Error("Сбой видеокодировщика"));
    signal.addEventListener("abort", abort, { once: true });
    try {
      if (signal.aborted) { abort(); return; }
      recorder.start(250);
      endTimer = window.setTimeout(() => {
        if (recorder.state !== "inactive") try { recorder.stop(); } catch { /* error callback */ }
      }, 1500);
      guard = window.setTimeout(() => {
        if (recorder.state !== "inactive") try { recorder.stop(); } catch { /* error callback */ }
        finish(new Error("Тайм-аут записи"));
      }, 6500);
    } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); }
  });
}


/** Load metadata of the actual encoded clip. This checks readable container/media
 * but does not claim accurate output FPS, bitrate, HDR or full-frame integrity.
 */
async function testClipPlayback(blob: Blob, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  return await new Promise<boolean>(resolve => {
    const video = document.createElement("video");
    video.preload = "metadata"; video.muted = true;
    const url = URL.createObjectURL(blob);
    let finished = false;
    const finish = (ok: boolean) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      video.onloadedmetadata = null; video.onerror = null;
      video.removeAttribute("src"); video.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const abort = () => finish(false);
    const timeout = window.setTimeout(() => finish(false), 4500);
    signal.addEventListener("abort", abort, { once: true });
    video.onloadedmetadata = () => finish(video.videoWidth > 0 && video.videoHeight > 0);
    video.onerror = () => finish(false);
    video.src = url;
  });
}

export async function verifyMode(deviceId: string, mode: TestMode, signal: AbortSignal): Promise<ModeEvidence> {
  const owner = Symbol("mode-test");
  const result: ModeEvidence = {
    api: "webview", cameraId: deviceId, requested: mode, checkedAt: Date.now(), state: "unknown",
  };
  try {
    if (signal.aborted) throw new Error("Отменено");
    const stream = await cameraController.acquire(owner, {
      video: { deviceId: { exact: deviceId }, width: { exact: mode.width },
        height: { exact: mode.height }, frameRate: { ideal: mode.fps } }, audio: false,
    });
    if (signal.aborted) throw new Error("Отменено");
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") throw new Error("Камера не открылась");
    const actual = track.getSettings();
    result.applied = { width: actual.width, height: actual.height, fps: actual.frameRate };
    const dimensionsMatch = [actual.width, actual.height].includes(mode.width) &&
      [actual.width, actual.height].includes(mode.height);
    const fpsMatch = typeof actual.frameRate === "number" && Math.abs(actual.frameRate - mode.fps) < 1.1;
    if (!dimensionsMatch || !fpsMatch) {
      result.state = "rejected";
      result.message = "Фактическое разрешение или FPS отличаются от запрошенных";
    } else {
      result.state = "applied";
      const blob = await recordSample(stream, signal);
      if (blob.size < 1024) throw new Error("Видео пустое");
      result.state = "recorded";
      const playable = await testClipPlayback(blob, signal);
      if (!playable) throw new Error("Кодировщик создал файл, но его не удалось прочитать");
      result.state = "verified";
      result.message = "Пробная запись читается (" + blob.size + " байт). Частота кадров файла ещё требует анализа";
    }
  } catch (e) {
    result.state = signal.aborted ? "unknown" : "rejected";
    result.message = signal.aborted ? "Проверка отменена" : e instanceof Error ? e.message : String(e);
  } finally { cameraController.release(owner); }
  if (!signal.aborted) recordModeEvidence(result);
  return result;
}
