import { recordingInputLostReason } from "./recording-finalization";
import { probeVideoBlobCheckpoints } from "./clip-checkpoints";
import { getActiveFoldBaseline } from "./fold-recording-evidence";
import { readPersistedClip, saveRecordedClipsAtomically, type RecordedClip } from "./clip-persistence";
import { assessSavedVideoDuration, verifyDecodedVideoBlob } from "./clip-playback";
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
/** Equal-length files are not proof of synchronization, but widely different
 * reported durations expose some prematurely terminated dual camera captures.
 * If either metadata duration is unavailable, return unknown rather than a
 * fabricated result.
 */
export function compareDualFileDurations(
  first: number | null, second: number | null,
): "consistent" | "mismatch" | "unknown" {
  if (first === null || second === null ||
      !Number.isFinite(first) || !Number.isFinite(second) ||
      first <= 0 || second <= 0 || Math.max(first, second) < 6)
    return "unknown";
  const longest = Math.max(first, second);
  return Math.abs(first - second) > Math.max(3, longest * 0.18)
    ? "mismatch" : "consistent";
}
/** Recover only non-empty chunks already emitted by MediaRecorder.
 * These bytes are unverified until persisted and decoded; this is not a claim
 * that a stalled encoder produced a finalized or playable container.
 */
export function salvageBufferedEncoderChunks(chunks: readonly Blob[], mime: string): Blob | null {
  const bytes = chunks.reduce((sum, chunk) => sum + (chunk.size || 0), 0);
  return bytes >= 1024 ? new Blob([...chunks], { type: mime }) : null;
}
/** Validate and capture identities in one step. Re-reading after the device
 * disappears can fail, even though partial encoded clips must still be saved.
 */
export function verifiedDualDeviceIds(
  first: MediaStream | null, second: MediaStream | null,
): [string, string] | null {
  if (!first || !second || first === second) return null;
  const a = first.getVideoTracks()[0], b = second.getVideoTracks()[0];
  if (!a || !b || a === b || a.readyState !== "live" || b.readyState !== "live") return null;
  try {
    const idA = a.getSettings().deviceId, idB = b.getSettings().deviceId;
    return idA && idB && idA !== idB ? [idA, idB] : null;
  } catch { return null; }
}
export function independentStreamsReady(first: MediaStream | null, second: MediaStream | null): boolean {
  return verifiedDualDeviceIds(first, second) !== null;
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
  const deviceIds = verifiedDualDeviceIds(first, second);
  if (!deviceIds) throw new Error("Две разные одновременно активные камеры не подтверждены");
  const mime = selectMime();
  const captures = [first, second];
  const recorders = captures.map(stream => new MediaRecorder(stream, { mimeType: mime }));
  const buffers: Blob[][] = [[], []];
  const starts: (number | null)[] = [null, null];
  let stopAt: number | null = null;
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
    if (!startedConfirmed || stopRequested) return;
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
    // Retain the ORIGINAL interruption cause. A later UI stop/unmount
    // must never erase the reason a camera recording first failed.
    if (reason && !stopReason) stopReason = reason;
    if (stopRequested) return;
    stopRequested = true;
    stopAt = performance.now();
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
      if (starts[i] !== null) return;
      starts[i] = performance.now();
      if (starts.every(x => x !== null) && !startedConfirmed && !stopRequested) {
        startedConfirmed = true;
        const initialFold = getActiveFoldBaseline();
        if (initialFold) folds = [initialFold];
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
      // A driver can emit data but omit onstart. Preserve real bytes even when
      // startup was never confirmed; paired success still requires both starts.
      settle(i, blob.size >= 1024 ? blob : null);
      if (!stopRequested) {
        endedUnexpectedly = true;
        stop("Один из видеопотоков завершился раньше второго");
      }
    };
  }
  // Preview tracks outlive recording sessions; retain handlers for cleanup.
  const trackEndHandlers: Array<{ track: MediaStreamTrack; handler: EventListener }> = [];
  for (const stream of captures) for (const track of stream.getTracks()) {
    const handler: EventListener = () => stop(recordingInputLostReason(track.kind === "audio" ? "audio" : "video", true));
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
        ...(deviceIds[index] ? {cameraDeviceId:deviceIds[index]!} : {}),
        ...(typeof starts[index] === "number" ? {monotonicStartMs:starts[index]!} : {}),
        synchronizationVerified: false,
        foldTransitions: folds,
        foldContinuityVerified: false,
      }] : []);
    if (!clips.length) throw new Error("Оба кодировщика не выдали пригодных файлов. " + [stopReason, ...failures].filter(Boolean).join("; "));
    // Persist all salvageable blobs first: a decoder crash must not discard
    // successfully encoded bytes. Verify persisted media, not temporary memory.
    await saveRecordedClipsAtomically(clips);
    const playable: RecordedClip[] = [];
    const fileDurations: (number | null)[] = [null, null];
    let sampledLaterClips = 0;
    for (const clip of clips) {
      try {
        const stored = await readPersistedClip(clip.id);
        const decoded = await verifyDecodedVideoBlob(stored.blob, undefined, 5000);
        fileDurations[clip.camera - 1] = decoded.durationSeconds;
        const laterFrames = await probeVideoBlobCheckpoints(stored.blob, decoded.durationSeconds, 4500);
        // Seek-based checks can be unavailable on WebView/WebM. In that
        // case do not treat the video as corrupt or fabricate completeness.
        if (laterFrames.status === "sampled") sampledLaterClips++;
        if (stopAt !== null && starts[clip.camera - 1] !== null) {
          const expected = Math.max(0, stopAt - starts[clip.camera - 1]!);
          const evidence = assessSavedVideoDuration(expected, decoded.durationSeconds);
          if (evidence.status === "short") {
            failures.push("Камера " + clip.camera +
              ": сохранённый файл существенно короче подтверждённого периода записи");
          }
        }
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
    const durationRelation = compareDualFileDurations(fileDurations[0] ?? null, fileDurations[1] ?? null);
    if (durationRelation === "mismatch")
      failures.push("Длительность двух видеоклипов сильно различается; совместная запись не подтверждена");
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
        ? "Оба видео сохранены и первый кадр каждого декодирован. " +
          (sampledLaterClips === 2 ? "По два поздних кадра выборочно декодированы в каждом файле. " : "Проверка поздних кадров частично недоступна. ") +
          "Точная синхронизация, все кадры, HDR и стабилизация не проверены."
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
