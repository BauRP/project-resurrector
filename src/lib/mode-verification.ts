import { cameraController, CameraBusyError, CameraSupersededError } from "./camera-controller";
import { recordModeEvidence, type ModeEvidence } from "./camera-passport";
import { verifyDecodedVideoBlob } from "./clip-playback";
export interface TestMode { width: number; height: number; fps: number }
export const TEST_MODES: readonly TestMode[] = [
  { width: 1280, height: 720, fps: 30 },
  { width: 1920, height: 1080, fps: 30 },
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
/** Only an explicitly unsatisfied camera constraint proves API-level incompatibility. */
export function classifyModeFailure(error: unknown, aborted: boolean): "unknown" | "rejected" {
  if (aborted || error instanceof CameraBusyError || error instanceof CameraSupersededError) return "unknown";
  if (!error || typeof error !== "object") return "unknown";
  const name = (error as { name?: unknown }).name;
  return name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" ? "rejected" : "unknown";
}

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
    result.applied = { width: actual.width, height: actual.height, fps: actual.frameRate };
    const dimensionsMatch = (actual.width === mode.width && actual.height === mode.height) ||
      (actual.width === mode.height && actual.height === mode.width);
    const fpsKnown = typeof actual.frameRate === "number" && Number.isFinite(actual.frameRate);
    const fpsMatch = fpsKnown && Math.abs(actual.frameRate! - mode.fps) < 1.1;
    if (actual.deviceId && actual.deviceId !== deviceId) {
      result.state = "unknown";
      result.message = "WebView открыл другой идентификатор камеры; этот объектив не подтверждён";
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
      // Stream settings and decoded file resolution are separate evidence.
      // A resized encoded file must never verify the originally requested mode.
      const exactFile = decodedOutputMatchesRequested(mode, frame);
      result.state = exactFile ? "verified" : "recorded";
      result.message = exactFile
        ? "Первый кадр файла декодирован (" + blob.size + " байт, " + frame.width + "×" + frame.height + "). FPS файла, HDR и стабилизация не проверены"
        : "Видеофайл декодирован, но размер кадра " + frame.width + "×" + frame.height +
          " отличается от выбранного " + mode.width + "×" + mode.height +
          "; режим записи с этим размером не подтверждён";
    }
  } catch (e) {
    result.state = classifyModeFailure(e, signal.aborted);
    result.message = signal.aborted ? "Проверка отменена" : e instanceof Error ? e.message : String(e);
  } finally { cameraController.release(owner); }
  // Transient contention must not overwrite earlier confirmed hardware evidence.
  if (!signal.aborted && result.state !== "unknown") recordModeEvidence(result);
  return result;
}
