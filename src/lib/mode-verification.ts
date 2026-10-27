import { cameraController, CameraBusyError, CameraSupersededError } from "./camera-controller";
import { recordModeEvidence, type ModeEvidence } from "./camera-passport";
import { verifyDecodedVideoBlob } from "./clip-playback";
export interface TestMode { width: number; height: number; fps: number }
export const TEST_MODES: readonly TestMode[] = [
  // Start with the common 1080p30 path, then a safer 720p30 fallback.
  // Neither is declared supported until actually tested on that lens.
  { width: 1920, height: 1080, fps: 30 },
  { width: 1280, height: 720, fps: 30 },
  { width: 1920, height: 1080, fps: 60 },
  { width: 2560, height: 1440, fps: 30 },
  { width: 3840, height: 2160, fps: 30 },
  { width: 3840, height: 2160, fps: 60 },
];
// Diagnostics request video only: do not require an Opus audio encoder.
const MIMES = ["video/webm;codecs=vp8","video/webm;codecs=vp9","video/webm","video/mp4;codecs=avc1"];

export function decodedOutputMatchesRequested(
  mode: TestMode, output: { width: number; height: number },
): boolean {
  return (output.width === mode.width && output.height === mode.height) ||
    (output.width === mode.height && output.height === mode.width);
}
/** A decoded first frame verifies a file's frame dimensions, not the
 * frame rate of the encoded track. Until an independent coded-frame-rate
 * check exists, the mode stays RECORDED instead of fully VERIFIED.
 */
export function decodedVideoModeEvidence(
  mode: TestMode, frame: { width: number; height: number }, bytes: number,
): { state: "recorded"; message: string } {
  const exact = decodedOutputMatchesRequested(mode, frame);
  return {
    state: "recorded",
    message: exact
      ? "Видеофайл и размер первого кадра подтверждены (" + bytes + " байт, " +
        frame.width + "×" + frame.height +
        "). Частота кадров кодированного файла и все кадры ещё не проверены"
      : "Видеофайл декодирован, но размер кадра " + frame.width + "×" + frame.height +
        " отличается от выбранного " + mode.width + "×" + mode.height +
        "; этот режим записи не подтверждён",
  };
}
/** A stream of the requested resolution is not proof of which lens opened.
 * Some OEM WebViews omit deviceId; in that case preserve "unknown" rather than
 * assigning a video recording to a possibly different physical camera.
 */
export function isVerifiedCameraIdentity(requestedId: string, reportedId: unknown): boolean {
  return !!requestedId && typeof reportedId === "string" && reportedId === requestedId;
}
/** Only an explicitly unsatisfied camera constraint proves API-level incompatibility. */
export function classifyModeFailure(error: unknown, aborted: boolean): "unknown" | "rejected" {
  if (aborted || error instanceof CameraBusyError || error instanceof CameraSupersededError) return "unknown";
  if (!error || typeof error !== "object") return "unknown";
  const name = (error as { name?: unknown }).name;
  return name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" ? "rejected" : "unknown";
}

/** One bounded, actual encoded sample; no fabricated tests or fake FPS claims.
 * The encoder must emit onstart before its output can prove a capture mode.
 */
export async function recordSample(stream: MediaStream, signal: AbortSignal): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder недоступен");
  const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("Подходящий видеокодировщик отсутствует");
  return new Promise<Blob>((resolve, reject) => {
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mime }); } catch (e) { reject(e); return; }
    const chunks: Blob[] = [];
    let done = false, started = false;
    let startTimer = 0, endTimer = 0, guard = 0;
    const finish = (failure?: Error) => {
      if (done) return;
      done = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(guard);
      signal.removeEventListener("abort", abort);
      recorder.onstart = null;
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (failure) reject(failure);
      else resolve(new Blob(chunks, { type: mime }));
    };
    const stopEncoder = () => {
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* A failed encoder may not stop normally. */ }
      }
    };
    const abort = () => {
      finish(new Error("Остановлено"));
      stopEncoder();
    };
    recorder.onstart = () => {
      if (done || started) return;
      started = true;
      window.clearTimeout(startTimer);
      // A late WebView onstart is not evidence of a timely recording.
      endTimer = window.setTimeout(stopEncoder, 1500);
    };
    recorder.ondataavailable = e => { if (!done && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => finish(started ? undefined : new Error("Кодировщик не подтвердил запуск"));
    recorder.onerror = () => {
      finish(new Error("Сбой видеокодировщика"));
      stopEncoder();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      if (signal.aborted) { abort(); return; }
      startTimer = window.setTimeout(() => {
        if (!started) {
          finish(new Error("Тайм-аут подтверждения запуска видеокодировщика"));
          stopEncoder();
        }
      }, 4000);
      guard = window.setTimeout(() => {
        finish(new Error("Тайм-аут записи"));
        stopEncoder();
      }, 8000);
      recorder.start(250);
    } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); stopEncoder(); }
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
        height: { exact: mode.height }, frameRate: { exact: mode.fps } }, audio: false,
    }, { preempt: false });
    if (signal.aborted) throw new Error("Отменено");
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") throw new Error("Камера не открылась");
    const actual = track.getSettings();
    result.applied = {
      ...(actual.width !== undefined ? {width:actual.width} : {}),
      ...(actual.height !== undefined ? {height:actual.height} : {}),
      ...(actual.frameRate !== undefined ? {fps:actual.frameRate} : {}),
    };
    const dimensionsMatch = (actual.width === mode.width && actual.height === mode.height) ||
      (actual.width === mode.height && actual.height === mode.width);
    const fpsKnown = typeof actual.frameRate === "number" && Number.isFinite(actual.frameRate);
    const fpsMatch = fpsKnown && Math.abs(actual.frameRate! - mode.fps) < 1.1;
    if (!isVerifiedCameraIdentity(deviceId, actual.deviceId)) {
      result.state = "unknown";
      result.message = actual.deviceId
        ? "WebView открыл другой идентификатор камеры; этот объектив не подтверждён"
        : "WebView не раскрыл идентификатор активной камеры; этот объектив не подтверждён";
    } else if (!dimensionsMatch || (fpsKnown && !fpsMatch)) {
      result.state = "rejected";
      result.message = "Фактическое разрешение или FPS отличаются от запрошенных";
    } else if (!fpsKnown) {
      result.state = "unknown";
      result.message = "WebView не сообщил фактический FPS: режим не подтверждён";
    } else {
      result.state = "applied";
      const blob = await recordSample(stream, signal);
      if (blob.size < 1024) throw new Error("Видео пустое");
      result.state = "recorded";
      const frame = await verifyDecodedVideoBlob(blob, signal, 5000);
      if (!frame.verifiedFirstFrame) throw new Error("Первый кадр не декодирован");
      result.file = { width: frame.width, height: frame.height, bytes: blob.size, mimeType: blob.type };
      // Real recorded codec FPS is not known from track.getSettings() or
      // a single decoded frame: never mark such an entire mode verified.
      const evidence = decodedVideoModeEvidence(mode, frame, blob.size);
      result.state = evidence.state;
      result.message = evidence.message;
    }
  } catch (e) {
    const reason = signal.aborted ? "Проверка отменена" :
      e instanceof Error ? e.message : String(e);
    // Preserve independently observed evidence even if a later encoder or
    // decoder step failed. An incomplete recording is not a verified FPS.
    const reached = result.state;
    result.state = signal.aborted ? "unknown" :
      reached === "recorded" || reached === "applied" ? reached :
      classifyModeFailure(e, false);
    result.message = reached === "recorded" && !signal.aborted
      ? "Видеофайл получен, но не прошёл проверку декодирования: " + reason
      : reached === "applied" && !signal.aborted
        ? "Видеопоток настроен, но пробная запись не подтверждена: " + reason
        : reason;
  } finally { cameraController.release(owner); }
  // Transient contention must not overwrite earlier confirmed hardware evidence.
  if (!signal.aborted && result.state !== "unknown") recordModeEvidence(result);
  return result;
}
