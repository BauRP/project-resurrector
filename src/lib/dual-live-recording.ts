import { readPersistedClip, saveRecordedClipsAtomically, type RecordedClip } from "./clip-persistence";
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
/** A saved pair may be complete as files but still interrupted as a session. */
export function isCleanDualRecording(input: {
  playable: number; startedConfirmed: boolean; failures: number;
  endedUnexpectedly: boolean; stopReason: string;
}): boolean {
  return input.playable === 2 && input.startedConfirmed && input.failures === 0 &&
    !input.endedUnexpectedly && !input.stopReason;
}
/** Recover only non-empty chunks already emitted by MediaRecorder.
 * These bytes are unverified until persisted and decoded; this is not a claim
 * that a stalled encoder produced a finalized or playable container.
 */
export function salvageBufferedEncoderChunks(chunks: readonly Blob[], mime: string): Blob | null {
  const bytes = chunks.reduce((sum, chunk) => sum + (chunk.size || 0), 0);
  return bytes >= 1024 ? new Blob(chunks, { type: mime }) : null;
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
  let endedUnexpectedly = false;
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
  const finished = [false, false];
  const settle = (index: number, value: Blob | null) => {
    if (finished[index]) return;
    finished[index] = true;
    finishers[index]?.(value);
  };
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
        if (!finished[i]) {
          failures.push("Кодировщик " + (i+1) + " не завершился за отведённое время");
          // Some encoders never emit onstop after an error. Preserve already
          // delivered data for independent storage and decoder verification.
          // This session remains failed; partial bytes may be unplayable.
          settle(i, salvageBufferedEncoderChunks(buffers[i]!, mime));
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
        // Startup is complete. This timeout must never terminate an otherwise
        // healthy long-running two-camera recording after eight seconds.
        window.clearTimeout(startupTimer);
        startupTimer = 0;
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
      settle(i, starts[i] !== null && blob.size >= 1024 ? blob : null);
      if (!stopRequested) {
        endedUnexpectedly = true;
        stop("Один из видеопотоков завершился раньше второго");
      }
    };
  }
  // Preview tracks outlive recording sessions; retain handlers for cleanup.
  const trackEndHandlers: Array<{ track: MediaStreamTrack; handler: EventListener }> = [];
  for (const stream of captures) for (const track of stream.getVideoTracks()) {
    const handler: EventListener = () => stop("Видеопоток потерян во время одновременной записи");
    track.addEventListener("ended", handler, { once: true });
    trackEndHandlers.push({ track, handler });
  }
  // Both recorders may fire onstart synchronously in some WebViews. Do not
  // arm an obsolete watchdog after they already confirmed starting.
  if (!startedConfirmed) startupTimer = window.setTimeout(
    () => stop("Не обе камеры подтвердили запуск за 8 секунд"), 8000);
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
    // Persist all salvageable blobs first: a decoder crash must not discard
    // successfully encoded bytes. Verify persisted media, not temporary memory.
    await saveRecordedClipsAtomically(clips);
    const playable: RecordedClip[] = [];
    for (const clip of clips) {
      try {
        const stored = await readPersistedClip(clip.id);
        await verifyDecodedVideoBlob(stored.blob, undefined, 5000);
        playable.push(clip);
      } catch (error) {
        failures.push("Камера " + clip.camera + ": сохранённый кадр не декодирован (" + String(error) + ")");
      }
    }
    if (!playable.length) return {
      savedIds: clips.map(c => c.id), paired: false,
      startedSkewMs: starts.every(x=>x!==null) ? Math.round(Math.abs(starts[0]! - starts[1]!)) : null,
      bytes: clips.map(c => c.blob.size),
      message: "Файлы сохранены, но их воспроизведение из медиатеки не подтверждено. " + failures.join("; "),
    };
    // A disappearing stream or forced recording stop is not equivalent
    // to a complete, uninterrupted pair even when both blobs decode.
    const both = isCleanDualRecording({
      playable: playable.length, startedConfirmed, failures: failures.length,
      endedUnexpectedly, stopReason,
    });
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
    trackEndHandlers.forEach(({ track, handler }) => track.removeEventListener("ended", handler));
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
      settle(i, null);
  }
  return { stop: (reason?: string) => { if (!completed) stop(reason); }, done };
}
