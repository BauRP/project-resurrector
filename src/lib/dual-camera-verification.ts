import { bounded } from "./async";
import { saveRecordedClipsAtomically, type RecordedClip } from "./clip-persistence";

/** Independent WebView devices are not automatically equivalent to Camera2 IDs. */
export interface DualCameraEvidence {
  firstDeviceId: string; secondDeviceId: string;
  first: { width: number | null; height: number | null; fps: number | null; bytes: number };
  second: { width: number | null; height: number | null; fps: number | null; bytes: number };
  startedSkewMs: number;
  savedClipIds: [string, string];
  status: "two-recordings-persisted";
  verifiedAt: number;
  note: string;
}
export function canTestDualDevices(first: string, second: string): boolean {
  return !!first && !!second && first !== second;
}

const stopStream = (stream: MediaStream) => stream.getTracks().forEach(t => t.stop());
function preferredMime(): string {
  if (typeof MediaRecorder === "undefined") throw new Error("WebView MediaRecorder недоступен");
  const types = ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/webm", "video/mp4;codecs=avc1"];
  const mime = types.find(type => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error("Нет кодировщика для двух камер");
  return mime;
}

async function readable(blob: Blob, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  return new Promise(resolve => {
    const video = document.createElement("video");
    video.preload = "metadata"; video.muted = true;
    const url = URL.createObjectURL(blob);
    let finished = false;
    const finish = (valid: boolean) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(guard);
      signal.removeEventListener("abort", onAbort);
      video.onloadedmetadata = null; video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(valid);
    };
    const onAbort = () => finish(false);
    const guard = window.setTimeout(() => finish(false), 5000);
    signal.addEventListener("abort", onAbort, { once: true });
    video.onloadedmetadata = () => finish(video.videoWidth > 0 && video.videoHeight > 0);
    video.onerror = () => finish(false);
    video.src = url;
  });
}
function shortRecording(recorder: MediaRecorder, signal: AbortSignal): Promise<{ blob: Blob; startedAt: number }> {
  return new Promise((resolve, reject) => {
    const chunks: Blob[] = [];
    let completed = false, startedAt = 0;
    let durationTimer = 0, guard = 0;
    const clean = () => {
      window.clearTimeout(durationTimer); window.clearTimeout(guard);
      signal.removeEventListener("abort", onAbort);
      recorder.onstart = null; recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
    };
    const fail = (error: Error) => {
      if (completed) return;
      completed = true; clean(); reject(error);
    };
    const onAbort = () => {
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* resource can already be released */ }
      }
      fail(new Error("Тест двух камер отменён"));
    };
    recorder.onstart = () => { startedAt = performance.now(); };
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => fail(new Error("Ошибка видеокодировщика второй/первой камеры"));
    recorder.onstop = () => {
      if (completed) return;
      if (!startedAt) { fail(new Error("Кодировщик не подтвердил запуск")); return; }
      const blob = new Blob(chunks, { type: recorder.mimeType });
      if (blob.size < 1024) { fail(new Error("Получен пустой видеоклип")); return; }
      completed = true; clean(); resolve({ blob, startedAt });
    };
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      if (signal.aborted) { onAbort(); return; }
      recorder.start(250);
      durationTimer = window.setTimeout(() => {
        if (recorder.state !== "inactive") try { recorder.stop(); } catch { fail(new Error("Ошибка остановки видео")); }
      }, 2800);
      guard = window.setTimeout(() => {
        if (recorder.state !== "inactive") try { recorder.stop(); } catch { /* ignored */ }
        fail(new Error("Истекло время ожидания двух записей"));
      }, 7500);
    } catch (error) { fail(error instanceof Error ? error : new Error(String(error))); }
  });
}

/**
 * Practical *simultaneous* test: two independent real device streams and two
 * concurrent MediaRecorder encoders. No dummy preview or simulated data.
 *
 * Passing proves only that two sample clips can be recorded and persisted
 * together in THIS WebView session; no claim about Camera2 concurrent groups,
 * sustained recording, EIS, synchronized frames or 4K is made.
 */
export async function verifyDualCameraRecording(firstId: string, secondId: string, signal: AbortSignal): Promise<DualCameraEvidence> {
  if (!canTestDualDevices(firstId, secondId)) throw new Error("Нужны две разные доступные камеры");
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("WebView камера недоступна");
  if (signal.aborted) throw new Error("Испытание отменено");
  const streams: MediaStream[] = [];
  const recorders: MediaRecorder[] = [];
  try {
    const constraints = (id: string): MediaStreamConstraints => ({
      video: { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    const first = await bounded(navigator.mediaDevices.getUserMedia(constraints(firstId)), 7000,
      "Первая камера", stopStream);
    streams.push(first);
    if (signal.aborted) throw new Error("Испытание отменено");
    const second = await bounded(navigator.mediaDevices.getUserMedia(constraints(secondId)), 7000,
      "Вторая камера", stopStream);
    streams.push(second);
    if (signal.aborted) throw new Error("Испытание отменено");
    const tracks = [first, second].map(s => s.getVideoTracks()[0]);
    if (tracks.some(track => !track || track.readyState !== "live")) throw new Error("Один видеопоток остановился при открытии второго");
    const settings = tracks.map(t => t!.getSettings());
    if (settings[0]?.deviceId && settings[1]?.deviceId && settings[0].deviceId === settings[1].deviceId)
      throw new Error("Оба потока переключились на один и тот же объектив");
    const mime = preferredMime();
    const a = new MediaRecorder(first, { mimeType: mime });
    const b = new MediaRecorder(second, { mimeType: mime });
    recorders.push(a, b);
    const pending = [shortRecording(a, signal), shortRecording(b, signal)];
    const finished = await Promise.all(pending);
    if (signal.aborted) throw new Error("Испытание отменено");
    if (!await readable(finished[0]!.blob, signal) || !await readable(finished[1]!.blob, signal))
      throw new Error("Один из двух записанных файлов не читается");
    const time = Date.now();
    const token = Math.random().toString(36).slice(2, 10);
    const ids: [string, string] = [\`dual-\${time}-\${token}-1\`, \`dual-\${time}-\${token}-2\`];
    const clips: RecordedClip[] = finished.map((capture, index) => ({
      id: ids[index]!, createdAt: time, camera: index + 1, mode: "dual-camera-diagnostic",
      profile: "standard", playbackRate: 1, blob: capture.blob,
    }));
    await saveRecordedClipsAtomically(clips);
    return {
      firstDeviceId: firstId, secondDeviceId: secondId,
      first: { width: settings[0]?.width ?? null, height: settings[0]?.height ?? null,
        fps: settings[0]?.frameRate ?? null, bytes: finished[0]!.blob.size },
      second: { width: settings[1]?.width ?? null, height: settings[1]?.height ?? null,
        fps: settings[1]?.frameRate ?? null, bytes: finished[1]!.blob.size },
      startedSkewMs: Math.round(Math.abs(finished[0]!.startedAt - finished[1]!.startedAt)),
      savedClipIds: ids, verifiedAt: Date.now(), status: "two-recordings-persisted",
      note: "WebView: два реально записанных и открываемых файла сохранены одной транзакцией. Продолжительная/синхронная/Camera2 запись не проверена.",
    };
  } finally {
    for (const recorder of recorders) if (recorder.state !== "inactive")
      try { recorder.stop(); } catch { /* already ended */ }
    streams.forEach(stopStream);
  }
}
