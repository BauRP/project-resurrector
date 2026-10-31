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
  const track = status.mp4TracksInspected === true && status.mp4HasVideoTrack === true;
  const decoded = status.mp4FirstFrameDecodable === true;
  const videoSamples = status.mp4VideoSamples ?? 0;
  const audioSamples = status.mp4AudioSamples ?? 0;
  const dimensions = status.mp4VideoWidth && status.mp4VideoHeight &&
    Number.isSafeInteger(status.mp4VideoWidth) &&
    Number.isSafeInteger(status.mp4VideoHeight)
    ? {width:status.mp4VideoWidth,height:status.mp4VideoHeight} : null;
  // MediaFormat track dimensions are encoded dimensions, not the
  // orientation metadata. Swapping width/height changes the recorded mode.
  const dimensionsMatch = !!dimensions &&
    dimensions.width === width && dimensions.height === height;
  // Corrupt negative, fractional or non-finite counters must not be treated
  // as clean video PTS evidence, even if the decoded keyframe exists.
  const videoTimestampCounters=[
    status.mp4VideoTimestampRollbacks??0,status.mp4VideoTimestampDuplicates??0,
  ];
  const anomalies = videoTimestampCounters.some(value=>
    !Number.isSafeInteger(value)||value!==0);
  // On an explicitly audited MP4 longer than 1.5 seconds, a failed tail
  // decode cannot certify the recorded mode. Older results lacking the
  // tail decoder field remain historical evidence, not invented failures.
  const tailDecodeFailure = (status.mp4DurationMs ?? -1)>1500 &&
    status.mp4TailFrameDecodable === false;
  // When the native service has measured a long MP4, both the tail
  // sample count and proximity must be explicitly confirmed. An absent
  // tail field is UNKNOWN, never implicit success for a newly audited file.
  const missingTailSamples = (status.mp4DurationMs ?? -1)>2000 &&
    (!(Number.isSafeInteger(status.mp4TailVideoSamples) &&
       status.mp4TailVideoSamples!>0) || status.mp4TailNearEnd !== true);
  // Native counters are untrusted until they form a possible bounded
  // result. Reject negative/overflowed values and "more passed than tested".
  const middleTotal=status.mp4MiddleProbes??0;
  const middlePassed=status.mp4MiddleMatched??0;
  const foldTotal=status.mp4FoldProbes??0;
  const foldPassed=status.mp4FoldMatched??0;
  const validCount=(passed:number,total:number,maximum:number)=>
    Number.isSafeInteger(passed)&&Number.isSafeInteger(total)&&
    total>=0&&total<=maximum&&passed>=0&&passed<=total;
  const checkpointMismatch =
    !validCount(middlePassed,middleTotal,3) ||
    !validCount(foldPassed,foldTotal,8) ||
    (middleTotal>0 && middlePassed<middleTotal) ||
    (foldTotal>0 && foldPassed<foldTotal);
  const observerGap=status.foldObserverGap===true;
  const omitted=status.foldCheckpointsOmitted??0;
  const invalidOmitted=!Number.isSafeInteger(omitted)||omitted<0;
  const skippedPoints=status.mp4FoldPointsSkipped??0;
  const invalidSkipped=!Number.isSafeInteger(skippedPoints)||skippedPoints<0||skippedPoints>8;
  const ptsChecks=status.mp4FoldPtsSpanChecks??0;
  const ptsLarge=status.mp4FoldPtsLargeGaps??0;
  const ptsMax=status.mp4MaxFoldPtsGapMs??0;
  const invalidFoldPts = !Number.isSafeInteger(ptsChecks) || ptsChecks<0 ||
    ptsChecks>8 || !Number.isSafeInteger(ptsLarge) || ptsLarge<0 ||
    ptsLarge>ptsChecks || !Number.isSafeInteger(ptsMax) || ptsMax<0;
  // A checkpoint that was decoded but had no bracketing video timestamps
  // cannot establish local continuity. Keep it unknown rather than recorded.
  // One measured PTS bracket is required for each probed fold. More
  // brackets than probes is also inconsistent evidence, not a success.
  const missingFoldSpan = ptsChecks !== foldTotal;
  const missingCheckpointAudit = status.mp4CheckpointAuditCompleted === false;
  const suspiciousFoldPts = invalidFoldPts || invalidSkipped || skippedPoints>0 ||
    ptsLarge>0 || missingFoldSpan || missingCheckpointAudit || invalidOmitted || omitted>0 || observerGap;
  const audioFoldChecks=status.mp4FoldAudioPtsSpanChecks??0;
  const audioFoldLarge=status.mp4FoldAudioPtsLargeGaps??0;
  const audioFoldMax=status.mp4MaxFoldAudioPtsGapMs??0;
  const audioFoldInvalid=!Number.isSafeInteger(audioFoldChecks)||audioFoldChecks<0||audioFoldChecks>8||
    !Number.isSafeInteger(audioFoldLarge)||audioFoldLarge<0||audioFoldLarge>audioFoldChecks||
    !Number.isSafeInteger(audioFoldMax)||audioFoldMax<0;
  const audioFoldUnknown=status.audioRequested===true && (audioFoldInvalid||audioFoldLarge>0||
    audioFoldChecks!==foldTotal);
  const audioPtsBad=status.audioRequested===true &&
    status.mp4AudioPtsAnomalies!==undefined &&
    (!Number.isSafeInteger(status.mp4AudioPtsAnomalies) || status.mp4AudioPtsAnomalies!==0);
  const audioTailMissing=status.audioRequested===true && (status.mp4DurationMs??-1)>2000 &&
    (!Number.isSafeInteger(status.mp4TailAudioSamples) || status.mp4TailAudioSamples!<=0 ||
     status.mp4TailAudioNearEnd!==true || status.mp4AvTailOffsetMeasured!==true ||
     !Number.isSafeInteger(status.mp4AvTailOffsetMs) || Math.abs(status.mp4AvTailOffsetMs!)>1000);
  const timelineValues=[status.mp4TimelineSamples,status.mp4TimelineRollbacks,status.mp4TimelineDuplicates,status.mp4TimelineLargeGaps,status.mp4TimelineMaxGapMs];
  const timelineInvalid=timelineValues.some(v=>v!==undefined&&(!Number.isSafeInteger(v)||v<0));
  const sensorDiscontinuities=status.sensorTimestampDiscontinuities??0;
  const sensorDiscontinuitiesUnknown=!Number.isSafeInteger(sensorDiscontinuities)||sensorDiscontinuities<0||sensorDiscontinuities>0;
  const captureFailures=status.cameraCaptureFailureEvents??0;
  const captureFailuresUnknown=!Number.isSafeInteger(captureFailures)||captureFailures<0||captureFailures>0;
  const callbackStalls=status.cameraCallbackStallEpisodes??0;
  const callbackStallsUnknown=!Number.isSafeInteger(callbackStalls)||callbackStalls<0||callbackStalls>0;
  const lowFpsWindows=status.mp4LowFpsWindows??0;
  const timelineUncertain=status.mp4TimelineCompleted===false || timelineInvalid ||
    sensorDiscontinuitiesUnknown || captureFailuresUnknown || callbackStallsUnknown || !Number.isSafeInteger(lowFpsWindows)||lowFpsWindows<0||lowFpsWindows>0 ||
    (status.mp4TimelineCompleted===true &&
      (!(status.mp4TimelineSamples!==undefined&&status.mp4TimelineSamples>=2) ||
       (status.mp4TimelineRollbacks??0)>0 || (status.mp4TimelineDuplicates??0)>0 ||
       (status.mp4TimelineLargeGaps??0)>0));
  const audioTimelineValues=[status.mp4AudioTimelineSamples,status.mp4AudioTimelineRollbacks,status.mp4AudioTimelineDuplicates,status.mp4AudioTimelineLargeGaps,status.mp4AudioTimelineMaxGapMs];
  const audioTimelineInvalid=audioTimelineValues.some(v=>v!==undefined&&(!Number.isSafeInteger(v)||v<0));
  const audioTimelineUnknown=status.audioRequested===true && (status.mp4AudioTimelineCompleted===false || audioTimelineInvalid ||
    (status.mp4AudioTimelineCompleted===true &&
      (status.mp4AudioTimelineTrackFound!==true || (status.mp4AudioTimelineSamples??0)<2 ||
       (status.mp4AudioTimelineRollbacks??0)>0 || (status.mp4AudioTimelineDuplicates??0)>0 ||
       (status.mp4AudioTimelineLargeGaps??0)>0)));
  const avDriftUnknown=status.audioRequested===true && (status.mp4AvDriftMeasured===false ||
    (status.mp4AvDriftMeasured===true &&
      (!Number.isSafeInteger(status.mp4AvDriftMs) || Math.abs(status.mp4AvDriftMs!)>500)));
  const audioIncomplete = status.audioRequested === true &&
    (!status.mp4HasAudioTrack || audioSamples <= 0);
  // Treat measured beginning/end MP4 timing as evidence about the selected
  // mode, not as full-file verification. Unknown measurements stay unknown.
  const fpsTolerance = Math.max(2, fps! * .1);
  const observedFps = [status.mp4SampledFps,status.mp4TailSampledFps,
    ...(status.mp4TimelineCompleted === true ? [status.mp4TimelineSampledFps] : [])]
    .filter((value): value is number => typeof value === "number" &&
      Number.isFinite(value) && value > 0);
  const measuredFpsMismatch = observedFps.some(value =>
    Math.abs(value - fps!) > fpsTolerance);
  // A video file with confirmed decoding, dimensions and samples is RECORDED,
  // not VERIFIED. A fold interruption or audio loss must remain explicit.
  const recordingConfirmed = filePresent && track && decoded &&
    Number.isSafeInteger(videoSamples) && videoSamples > 0 &&
    dimensionsMatch && !anomalies && !audioIncomplete && !audioPtsBad && !audioTailMissing && !audioFoldUnknown &&
    !measuredFpsMismatch && !tailDecodeFailure && !missingTailSamples &&
    !checkpointMismatch && !suspiciousFoldPts && !timelineUncertain && !audioTimelineUnknown && !avDriftUnknown;
  const state: ModeEvidence["state"] = recordingConfirmed &&
    status.state === "saved" ? "recorded" : "unknown";
  const reason = !filePresent ? "Файл MP4 не подтверждён." :
    !track ? "Наличие видеодорожки не подтверждено." :
    !decoded ? "Декодирование видеокадра не подтверждено." :
    !dimensionsMatch ? "Фактическое разрешение не подтверждено или отличается." :
    videoSamples <= 0 ? "Наличие видеокадров не подтверждено." :
    anomalies ? "В проверенном участке обнаружены нарушения времени кадров." :
    audioIncomplete ? "Запрошенная звуковая дорожка не подтверждена." :
    audioPtsBad ? "Обнаружены нарушения временных меток аудиодорожки." :
    audioFoldUnknown ? "Временные метки аудио возле складывания не подтверждены." :
    audioTailMissing ? "Конец аудиодорожки MP4 или её временное согласование с видео не подтверждены." :
    measuredFpsMismatch ? "Измеренный FPS части MP4 отличается от выбранного режима." :
    tailDecodeFailure ? "Кадр в конце MP4 не удалось декодировать." :
    missingTailSamples ? "Не подтверждены видеосэмплы возле конца MP4." :
    checkpointMismatch ? "Часть кадров около середины/складывания не декодировалась." :
    timelineUncertain ? "Последовательная проверка временных меток MP4 неполна или обнаружены подозрительные интервалы." :
    audioTimelineUnknown ? "Последовательная проверка временных меток звука неполна или обнаружены подозрительные интервалы." :
    avDriftUnknown ? "Начальный и конечный сдвиг аудиовидеодорожек не подтверждён или заметно изменился." :
    suspiciousFoldPts ? (observerGap
      ? "Наблюдение за складыванием прерывалось; непрерывность MP4 неизвестна."
      : omitted>0
      ? "Не все изменения положения проверены: журнал MP4 ограничен восемью точками."
      : skippedPoints>0
      ? "Часть отмеченных складываний MP4 была пропущена как непригодная для проверки."
      : missingCheckpointAudit
      ? "Проверка промежуточных кадров MP4 не завершена."
      : missingFoldSpan
      ? "Временные метки кадров не удалось проверить возле каждого складывания."
      : "Обнаружен большой или недостоверный интервал видеометок возле складывания.") :
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
      "/" + (status.mp4MiddleProbes??0) + ", точки складывания/геометрии " +
      (status.mp4FoldMatched??0) + "/" + (status.mp4FoldProbes??0) +
      " (выборка, не вся запись)."
    : " Промежуточные точки MP4 не проверены.";
  const timelineEvidence=status.mp4TimelineCompleted!==undefined
    ? " Временные метки всего MP4: " + (status.mp4TimelineCompleted?"полный обход":"ограниченный обход") +
      "; сэмплов " + (status.mp4TimelineSamples??0) + ", подозрительных пауз " +
      (status.mp4TimelineLargeGaps??0) + ", откатов " + (status.mp4TimelineRollbacks??0) +
      ", повторов " + (status.mp4TimelineDuplicates??0) + ". Это не декодирование каждого кадра."
    : "";
  const audioTimelineEvidence=status.audioRequested && status.mp4AudioTimelineCompleted!==undefined
    ? " Аудиометки MP4: " + (status.mp4AudioTimelineCompleted?"полный обход":"ограниченный обход") +
      "; сэмплов " + (status.mp4AudioTimelineSamples??0) + ", подозрительных пауз " +
      (status.mp4AudioTimelineLargeGaps??0) + "." : "";
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
      stabilizationEvidence + foldAuditNotes + timelineEvidence + audioTimelineEvidence +
      (status.mp4AvDriftMeasured ? ` Измеренный дрейф аудио/видео: ${status.mp4AvDriftMs} мс.` : "") +
      " Реальная эффективность стабилизации всего MP4 и непрерывность при складывании не подтверждены.",
  };
}
