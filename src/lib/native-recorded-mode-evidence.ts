import type { ModeEvidence } from "./camera-passport";
import type { NativeCaptureStatus } from "./native-capture";

/** Map ACTUAL post-finalization MP4 evidence into the individual Camera2
 * mode passport. One decoded frame and a bounded sample scan do not verify
 * the entire file, its stabilization, or audio quality.
 */
export function nativeRecordedModeEvidence(
  status: NativeCaptureStatus,
  checkedAt: number,
): ModeEvidence | null {
  if (!["saved", "saved_interrupted", "interrupted", "error"].includes(status.state)) return null;
  const cameraId = status.cameraId ?? "";
  const width = status.width, height = status.height, fps = status.fps;
  if (!cameraId || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) ||
      !Number.isFinite(fps) || !(width! > 0 && height! > 0 && fps! > 0) ||
      !Number.isFinite(checkedAt) || checkedAt <= 0) return null;
  const bytes = status.savedBytes;
  const filePresent = Number.isSafeInteger(bytes) && bytes >= 1024;
  const track = status.mp4TracksInspected && status.mp4HasVideoTrack;
  const decoded = status.mp4FirstFrameDecodable === true;
  const videoSamples = status.mp4VideoSamples ?? 0;
  const audioSamples = status.mp4AudioSamples ?? 0;
  const dimensions = status.mp4VideoWidth && status.mp4VideoHeight &&
    Number.isSafeInteger(status.mp4VideoWidth) &&
    Number.isSafeInteger(status.mp4VideoHeight)
    ? {width:status.mp4VideoWidth,height:status.mp4VideoHeight} : null;
  const dimensionsMatch = !!dimensions && (
    (dimensions.width === width && dimensions.height === height) ||
    (dimensions.width === height && dimensions.height === width));
  const anomalies = (status.mp4VideoTimestampRollbacks ?? 0) > 0 ||
    (status.mp4VideoTimestampDuplicates ?? 0) > 0;
  // On an explicitly audited MP4 longer than 1.5 seconds, a failed tail
  // decode cannot certify the recorded mode. Older results lacking the
  // tail decoder field remain historical evidence, not invented failures.
  const tailDecodeFailure = (status.mp4DurationMs ?? -1)>1500 &&
    status.mp4TailFrameDecodable === false;
  const checkpointMismatch =
    (typeof status.mp4MiddleProbes==="number" && status.mp4MiddleProbes>0 &&
      (status.mp4MiddleMatched??0)<status.mp4MiddleProbes) ||
    (typeof status.mp4FoldProbes==="number" && status.mp4FoldProbes>0 &&
      (status.mp4FoldMatched??0)<status.mp4FoldProbes);
  const audioIncomplete = status.audioRequested === true &&
    (!status.mp4HasAudioTrack || audioSamples <= 0);
  // Treat measured beginning/end MP4 timing as evidence about the selected
  // mode, not as full-file verification. Unknown measurements stay unknown.
  const fpsTolerance = Math.max(2, fps! * .1);
  const observedFps = [status.mp4SampledFps,status.mp4TailSampledFps]
    .filter((value): value is number => typeof value === "number" &&
      Number.isFinite(value) && value > 0);
  const measuredFpsMismatch = observedFps.some(value =>
    Math.abs(value - fps!) > fpsTolerance);
  // A video file with confirmed decoding, dimensions and samples is RECORDED,
  // not VERIFIED. A fold interruption or audio loss must remain explicit.
  const recordingConfirmed = filePresent && track && decoded &&
    videoSamples > 0 && dimensionsMatch && !anomalies && !audioIncomplete &&
    !measuredFpsMismatch && !tailDecodeFailure && !checkpointMismatch;
  const state: ModeEvidence["state"] = recordingConfirmed &&
    status.state === "saved" ? "recorded" : "unknown";
  const reason = !filePresent ? "Файл MP4 не подтверждён." :
    !track ? "Наличие видеодорожки не подтверждено." :
    !decoded ? "Декодирование видеокадра не подтверждено." :
    !dimensionsMatch ? "Фактическое разрешение не подтверждено или отличается." :
    videoSamples <= 0 ? "Наличие видеокадров не подтверждено." :
    anomalies ? "В проверенном участке обнаружены нарушения времени кадров." :
    audioIncomplete ? "Запрошенная звуковая дорожка не подтверждена." :
    measuredFpsMismatch ? "Измеренный FPS части MP4 отличается от выбранного режима." :
    tailDecodeFailure ? "Кадр в конце MP4 не удалось декодировать." :
    checkpointMismatch ? "Часть кадров около середины/складывания не декодировалась." :
    "Файл записан; подтверждены видеодорожка, декодируемый кадр и выборка кадров.";
  const prefix = status.state === "saved_interrupted" || status.state === "interrupted"
    ? "При записи было прерывание или неполное подтверждение. " : "";
  const stabilizationNotes = [
    status.recordingEisFrames ?? 0,status.recordingOisFrames ?? 0,
    status.recordingStabilizationOffFrames ?? 0,status.recordingStabilizationUnknownFrames ?? 0,
  ];
  const foldAuditNotes = status.mp4MiddleProbes!==undefined ||
    status.mp4FoldProbes!==undefined
    ? " Проверка кадров MP4 (декодирование + близкая PTS-метка): середина " + (status.mp4MiddleMatched??0) +
      "/" + (status.mp4MiddleProbes??0) + ", точки складывания " +
      (status.mp4FoldMatched??0) + "/" + (status.mp4FoldProbes??0) +
      " (выборка, не вся запись)."
    : " Промежуточные точки MP4 не проверены.";
  const stabilizationEvidence = stabilizationNotes.some(value=>value>0)
    ? " Во время записи наблюдались состояния стабилизации (EIS/OIS/OFF/UNKNOWN): "
      + stabilizationNotes.join("/") + "."
    : " Состояние стабилизации именно во время записи неизвестно.";
  return {
    api:"camera2",cameraId,
    requested:{width:width!,height:height!,fps:fps!},
    // Requested sensor FPS is NOT treated as measured encoder FPS.
    ...(filePresent && dimensions && decoded ? {
      file:{...dimensions,bytes:bytes!,mimeType:"video/mp4"},
    } : {}),
    state,
    checkedAt,
    message:prefix + reason +
      stabilizationEvidence + foldAuditNotes +
      " Реальная эффективность стабилизации всего MP4 и непрерывность при складывании не подтверждены.",
  };
}
