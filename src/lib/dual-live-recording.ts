import { saveRecordedClip, saveRecordedClipsAtomically, type RecordedClip } from "./clip-persistence";
import { verifyDecodedVideoBlob } from "./clip-playback";
import { FOLD_EVENT, appendFoldTransition, normalizeFoldTransition, type FoldTransitionEvidence } from "./fold-recording-evidence";

export interface DualRecordingResult {
  savedIds: string[];
  paired: boolean;
  startedSkewMs: number | null;
  bytes: number[];
  message: string;
}
export interface DualRecordingSession {
  stop: (reason?: string) => void;
  done: Promise<DualRecordingResult>;
}
export function independentStreamsReady(first: MediaStream | null, second: MediaStream | null): boolean {
  if (!first || !second || first === second) return false;
  const a = first.getVideoTracks()[0], b = second.getVideoTracks()[0];
  if (!a || !b || a === b || a.readyState !== "live" || b.readyState !== "live") return false;
  const idA = a.getSettings().deviceId, idB = b.getSettings().deviceId;
  return !!idA && !!idB && idA !== idB;
}
function selectMime(): string {
  if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder недоступен");
  const formats = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8",
    "video/webm;codecs=vp9", "video/webm", "video/mp4;codecs=avc1"];
  const selected = formats.find(m => MediaRecorder.isTypeSupported(m));
  if (!selected) throw new Error("Нет общего видеокодировщика для двух потоков");
  return selected;
}

/**
 * Real independent WebView streams and two actual MediaRecorders.
 * No synthetic second image, mirrored video or server sync claim.
 * A common capture clock is NOT supplied by this API.
 *
 * If the second encoder fails, preserve the valid first clip instead of
 * discarding it; never label this as a successful paired recording.
 */
export function startDualRecording(
  first: MediaStream,
  second: MediaStream,
  onBothStarted: (skewMs: number) => void,
): DualRecordingSession {
  if (!independentStreamsReady(first, second)) throw new Error("Две разные одновременно активные камеры не подтверждены");
  const mime = selectMime();
  const captures = [first, second];
  const recorders = captures.map(stream => new MediaRecorder(stream, { mimeType: mime }));
  const buffers: Blob[][] = [[], []];
  const starts: (number | null)[] = [null, null];
  const failures: string[] = [];
  let stopRequested = false;
  let completed = false;
  let startedConfirmed = false;
  let stopReason = "";
  let startupTimer = 0, stopTimer = 0;
  const startTime = Date.now();
  let folds: FoldTransitionEvidence[] = [];
  const onFold = (event: Event) => {
    const reading = normalizeFoldTransition((event as CustomEvent).detail, Date.now());
    if (reading) folds = appendFoldTransition(folds, reading);
  };
  window.addEventListener(FOLD_EVENT, onFold);
  const finishers: ((value: Blob | null) => void)[] = [];
  const collected = recorders.map((_recorder, i) => new Promise<Blob | null>(resolve => {
    finishers[i] = resolve;
  }));
  const stop = (reason = "") => {
    if (reason) stopReason = reason;
    if (stopRequested) return;
    stopRequested = true;
    window.clearTimeout(startupTimer);
    stopTimer = window.setTimeout(() => {
      for (let i = 0; i < recorders.length; i++) {
        if (recorders[i]!.state !== "inactive") {
          failures.push("Кодировщик " + (i+1) + " не завершился за отведённое время");
          // A stalled encoder cannot be trusted as having saved a clip.
          finishers[i]?.(null);
        }
      }
    }, 12000);
    for (const recorder of recorders) {
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch (e) { failures.push("Ошибка остановки: " + String(e)); }
      }
    }
  };
  for (let i = 0; i < recorders.length; i++) {
    const recorder = recorders[i]!;
    recorder.onstart = () => {
      starts[i] = performance.now();
      if (starts.every(x => x !== null) && !startedConfirmed && !stopRequested) {
        startedConfirmed = true;
        onBothStarted(Math.round(Math.abs(starts[0]! - starts[1]!)));
      }
      if (stopRequested && recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* stop timer will resolve */ }
      }
    };
    recorder.ondataavailable = e => { if (e.data.size) buffers[i]!.push(e.data); };
    recorder.onerror = e => {
      failures.push("Камера " + (i+1) + ": " + ((e as Event & { error?: Error }).error?.message || "ошибка кодировщика"));
      stop("Один видеокодировщик отказал");
    };
    recorder.onstop = () => {
      const blob = new Blob(buffers[i], { type: mime });
      finishers[i]?.(starts[i] !== null && blob.size >= 1024 ? blob : null);
      if (!stopRequested) stop("Один из видеопотоков завершился раньше второго");
    };
  }
  for (const stream of captures) for (const track of stream.getVideoTracks()) {
    track.addEventListener("ended", () => stop("Видеопоток потерян во время одновременной записи"), { once: true });
  }
  startupTimer = window.setTimeout(() => stop("Не обе камеры подтвердили запуск за 8 секунд"), 8000);
  const done = Promise.all(collected).then(async blobs => {
    completed = true;
    window.clearTimeout(startupTimer);
    window.clearTimeout(stopTimer);
    window.removeEventListener(FOLD_EVENT, onFold);
    recorders.forEach(recorder => {
      recorder.onstart = null; recorder.ondataavailable = null;
      recorder.onerror = null; recorder.onstop = null;
    });
    const token = startTime + "-" + Math.random().toString(36).slice(2, 9);
    const clips: RecordedClip[] = blobs.flatMap((blob, index) =>
      blob ? [{
        id: "dual-live-" + token + "-" + (index+1), createdAt: startTime,
        camera: index+1, mode: "dual-live", profile: "standard", playbackRate: 1, blob,
        captureGroupId: "dual-live-" + token,
        cameraDeviceId: captures[index]!.getVideoTracks()[0]!.getSettings().deviceId,
        monotonicStartMs: starts[index] ?? undefined,
        synchronizationVerified: false,
        foldTransitions: folds,
        foldContinuityVerified: false,
      }] : []);
    if (!clips.length) throw new Error("Оба кодировщика не выдали пригодных файлов. " + [stopReason, ...failures].filter(Boolean).join("; "));
    // A successful encoder output is checked for an actual decoded first frame
    // before it can be presented as a good recorded camera sample.
    const playable: RecordedClip[] = [];
    for (const clip of clips) {
      try { await verifyDecodedVideoBlob(clip.blob, undefined, 5000); playable.push(clip); }
      catch (error) { failures.push("Камера " + clip.camera + ": кадр не декодирован (" + String(error) + ")"); }
    }
    if (!playable.length) {
      // Preserve both bytes even if the WebView decoder is unavailable; do not
      // claim that these clips play correctly.
      await saveRecordedClipsAtomically(clips);
      return { savedIds: clips.map(c => c.id), paired: false,
        startedSkewMs: starts.every(x=>x!==null) ? Math.round(Math.abs(starts[0]! - starts[1]!)) : null,
        bytes: clips.map(c => c.blob.size),
        message: "Файлы сохранены, но декодирование видео не подтверждено. " + failures.join("; ") };
    }
    const both = playable.length === 2 && startedConfirmed && failures.length === 0;
    if (playable.length === 2) await saveRecordedClipsAtomically(playable);
    else {
      // Never erase a non-decodable original: keep it too if present.
      await saveRecordedClipsAtomically(clips);
    }
    return {
      savedIds: clips.map(c => c.id),
      paired: both,
      startedSkewMs: starts.every(x=>x!==null) ? Math.round(Math.abs(starts[0]! - starts[1]!)) : null,
      bytes: clips.map(c => c.blob.size),
      message: both
        ? "Оба видео сохранены и первый кадр каждого декодирован. Точная синхронизация, HDR и стабилизация не проверены."
        : "Запись завершилась частично/с ошибкой; доступные файлы сохранены. " +
          [stopReason, ...failures].filter(Boolean).join("; "),
    };
  }).finally(() => {
    window.removeEventListener(FOLD_EVENT, onFold);
    completed = true;
    window.clearTimeout(startupTimer);
    window.clearTimeout(stopTimer);
  });
  try { for (const recorder of recorders) recorder.start(1000); }
  catch (error) {
    failures.push("Запуск записи: " + String(error));
    stop("Второй кодировщик не удалось запустить");
    // A start() that throws without firing onstop must not block forever.
    for (let i=0;i<recorders.length;i++) if (recorders[i]!.state === "inactive" && starts[i] === null)
      finishers[i]?.(null);
  }
  return { stop: (reason?: string) => { if (!completed) stop(reason); }, done };
}
