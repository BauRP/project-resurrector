/**
 * Finalization policy for WebView MediaRecorder.
 * Never discard received encoder chunks only because MediaRecorder.onerror fired;
 * nevertheless do not label an interrupted session as successfully recorded.
 */
export interface RecordingFinalization {
  attemptSave: boolean;
  incomplete: boolean;
  message: string;
}
export function planRecordingFinalization(bytes: number, encoderError: string, stopReason: string): RecordingFinalization {
  const messages = [encoderError && "Ошибка кодировщика: " + encoderError,
    stopReason && stopReason].filter(Boolean);
  const incomplete = messages.length > 0;
  if (!Number.isFinite(bytes) || bytes < 1024) return {
    attemptSave: false,
    incomplete: true,
    message: messages.join("; ") || "Кодировщик не создал пригодный файл",
  };
  return {
    attemptSave: true,
    incomplete,
    message: incomplete ? "Частичная запись: " + messages.join("; ") :
      "Запись завершилась; требуется проверка сохранённого видео",
  };
}

/** A WebView encoder may never dispatch onstop, particularly after errors or
 * a background interruption. A bounded fallback salvages emitted chunks while
 * flagging the result as incomplete. Late duplicate callbacks are ignored.
 */
export function createRecordingStopGuard(
  finalize: () => void, onTimeout: () => void, timeoutMs = 12000,
) {
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const finish = () => {
    if (finished) return;
    finished = true;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    finalize();
  };
  return {
    waitForStop() {
      if (finished || timer !== null) return;
      timer = setTimeout(() => {
        timer = null;
        if (finished) return;
        onTimeout();
        finish();
      }, timeoutMs);
    },
    finish,
  };
}

/** Startup must be acknowledged by a real encoder onstart event; otherwise
 * WebView may leave the capture button in 'starting' forever.
 */
export function createRecorderStartGuard(onTimeout: () => void, timeoutMs = 8000) {
  let completed = false;
  const timer = setTimeout(() => {
    if (completed) return;
    completed = true;
    onTimeout();
  }, timeoutMs);
  return {
    started() { if (completed) return false; completed = true; clearTimeout(timer); return true; },
    cancel() { completed = true; clearTimeout(timer); },
  };
}
