import type { NativeMp4Inspection } from "./native";
import type { ModeEvidence } from "./camera-passport";

/** A Camera2 high-speed MP4 that exists on disk is independent evidence of
 * capture. Only an actual full-file decode / validated encoder output can
 * elevate a mode to VERIFIED. Header declarations or one set of samples do not.
 */
export function highSpeedRecordedModeEvidence(
  cameraId: string,
  requested: { width: number; height: number; fps: number },
  output: { bytes: number; inspection?: NativeMp4Inspection; inspectionError?: string },
  checkedAt: number,
): ModeEvidence {
  const inspected = output.inspection;
  const requestedValid = !!cameraId && [requested.width, requested.height, requested.fps]
    .every(n => Number.isFinite(n) && n > 0);
  const filePresent = Number.isSafeInteger(output.bytes) && output.bytes >= 1024;
  const width = inspected?.width, height = inspected?.height;
  const inspectedDimensions = typeof width === "number" && typeof height === "number" &&
    Number.isSafeInteger(width) && Number.isSafeInteger(height) && width > 0 && height > 0;
  const dimensionsMatch = inspectedDimensions && (
    (width === requested.width && height === requested.height) ||
    (width === requested.height && height === requested.width)
  );
  const head = inspected?.estimatedSampleFps, tail = inspected?.tailEstimatedSampleFps;
  const sampleMatches = (fps: number | null | undefined) =>
    typeof fps === "number" && Number.isFinite(fps) &&
    Math.abs(fps - requested.fps) <= Math.max(2, requested.fps * 0.1);
  const bothSamplesMatch = sampleMatches(head) && sampleMatches(tail);
  const tailNearEnd = inspected?.tailSampleNearDeclaredEnd === true;
  const state: ModeEvidence["state"] = !requestedValid || !filePresent
    ? "unknown" : "recorded";
  const details = !inspected ? "Анализ MP4 недоступен; разрешение и FPS кодека неизвестны." :
    !inspectedDimensions ? "Декодированное разрешение MP4 не получено." :
    !dimensionsMatch ? "Размер видеодорожки MP4 отличается от запрошенного режима." :
    bothSamplesMatch && tailNearEnd
      ? "Размер MP4 совпал, измеренные сэмплы в начале и конце близки к выбранному FPS."
      : "Размер MP4 совпал; FPS начала/конца файла и наличие поздних кадров полностью не подтверждены.";
  return {
    api: "camera2", cameraId, requested, checkedAt, state,
    applied: undefined, // Camera2 configure request is not a per-frame CaptureResult.
    file: inspectedDimensions && filePresent ? {
      width: width!, height: height!, bytes: output.bytes,
      mimeType: inspected?.mime?.startsWith("video/") ? inspected.mime : "video/unknown",
    } : undefined,
    message: (filePresent ? "Нативный MP4 сохранён. " : "MP4 не сохранён. ") +
      details + " Проверка всех кадров, стабилизации и качества звука не выполнена.",
  };
}
