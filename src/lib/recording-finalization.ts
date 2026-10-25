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
