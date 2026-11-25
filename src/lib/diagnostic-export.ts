/** Privacy-preserving, strictly allowlisted diagnostic export.
 * A local Camera2/WebView camera identifier, lens label, file path, raw error
 * text, user agent or microphone identifier must NEVER be serialized.
 * Reports contain no photo/video/audio bytes and never contact a server.
 */
import type { ModeEvidence } from "./camera-passport";
import type { NativeCameraProfile, NativeMp4Inspection } from "./native";
import type { CameraAuditCheckpoint } from "./first-run-camera-audit";
import { declaredHighSpeedCandidates } from "./native-mode-selection";

export interface DiagnosticExportInput {
  nativeCameras: readonly NativeCameraProfile[];
  modes: readonly ModeEvidence[];
  mp4: NativeMp4Inspection | null;
  checkedAt: string;
  firstRun?: CameraAuditCheckpoint | null;
}

export function buildAnonymousCameraReport(input: DiagnosticExportInput) {
  const names = new Map<string,string>();
  const alias = (id: string) => {
    if (!names.has(id)) names.set(id, "camera-" + (names.size + 1));
    return names.get(id)!;
  };
  // Camera2 IDs and WebView deviceId belong to independent namespaces:
  // identical raw strings MUST NOT accidentally imply identical hardware.
  const camera2 = (id: string) => alias("camera2:" + id);
  const webview = (id: string) => alias("webview:" + id);
  const safeNumber = (n: unknown): number | null =>
    typeof n === "number" && Number.isFinite(n) ? n : null;
  return {
    schema: "multicam-anonymous-diagnostics-v1",
    checkedAt: input.checkedAt,
    privacy: "Локальный отчёт без ID устройств, путей, исходных ошибок, изображения и звука",
    limitations: "Camera2 и WebView независимы; системные декларации не доказывают реальный FPS, EIS/OIS, HDR или качество файла.",
    camera2: input.nativeCameras.map(cam => ({
      camera: camera2(cam.cameraId),
      facing: cam.facing,
      physicalCameraCount: cam.physicalCameraIds?.length ?? null,
      declaredVideoSizes: cam.videoOutputSizes?.map(mode => ({
        width: mode.width, height: mode.height,
        minFrameDurationNs: safeNumber(mode.minFrameDurationNs),
        theoreticalMaxFps: safeNumber(mode.theoreticalMaxFps),
      })) ?? [],
      eisDeclared: !!cam.eisDeclared,
      oisDeclared: !!cam.oisDeclared,
      hdrRecordedAndVerified: false,
      rawDeclared: !!cam.raw,
      // Native constrained high-speed declarations do not prove the
      // creation of a capture session, a codec, or an actual MP4 recording.
      highSpeedDeclared: declaredHighSpeedCandidates(cam),
    })),
    firstRunCamera2: input.firstRun ? {
      stage: ["not-started","running","retry","complete"].includes(input.firstRun.state) ? input.firstRun.state : "unknown",
      declaredCameraCount: safeNumber(input.firstRun.total),
      completedMetadataCount: safeNumber(input.firstRun.completed),
      completedCodecCount: safeNumber(input.firstRun.codecCompleted),
      completedPlanCount: safeNumber(input.firstRun.planCompleted),
      recordingValidated: false,
      cameras: Object.entries(input.firstRun.cameras ?? {}).slice(0,64).map(([id,cam]) => ({
        camera: camera2(id),
        facing: ["front","back","external"].includes(cam.facing ?? "") ? cam.facing : "unknown",
        codecChecks: (Array.isArray(cam.codecChecks) ? cam.codecChecks : []).slice(0,24).filter(check=>check && typeof check === "object").map(check=>({
          width: safeNumber(check.width), height: safeNumber(check.height), fps: safeNumber(check.fpsRequested),
          state: ["declared-compatible","not-declared-by-camera","not-declared-by-encoder"].includes(check.status) ? check.status : "unknown",
          recordedAndVerified: false,
        })),
        plannedModes: (Array.isArray(cam.functionalPlan) ? cam.functionalPlan : []).slice(0,8).filter(mode=>mode && typeof mode === "object").map(mode=>({
          width: safeNumber(mode.width), height: safeNumber(mode.height), fps: safeNumber(mode.fps),
          evidence: "declared-compatible-only", status: "not-run", verifiedRecording: false,
        })),
      })),
    } : null,
    webviewModes: input.modes.map(test => ({
      camera: test.api === "camera2" ? camera2(test.cameraId) : webview(test.cameraId),
      api: test.api === "camera2" ? "camera2" : "webview",
      requested: { ...test.requested },
      applied: test.applied ? { ...test.applied } : null,
      result: test.state,
      checkedAt: safeNumber(test.checkedAt),
      file: test.file ? {
        width: test.file.width, height: test.file.height,
        bytes: test.file.bytes,
        mimeType: /^video\/[a-z0-9.+-]+$/i.test(test.file.mimeType)
          ? test.file.mimeType : "unknown",
      } : null,
    })),
    lastNativeMp4: input.mp4 ? {
      bytes: safeNumber(input.mp4.bytes),
      width: safeNumber(input.mp4.width),
      height: safeNumber(input.mp4.height),
      declaredFrameRate: safeNumber(input.mp4.declaredFrameRate),
      estimatedSampleFps: safeNumber(input.mp4.estimatedSampleFps),
      samplesRead: safeNumber(input.mp4.samplesRead),
      timestampSpanUs: safeNumber(input.mp4.timestampSpanUs),
      outOfOrderPresentationTimes: safeNumber(input.mp4.outOfOrderPresentationTimes),
      audioTrackCount: safeNumber(input.mp4.audioTrackCount),
      audioSamplesRead: safeNumber(input.mp4.audioSamplesRead),
      audioSampleTimestampRollbacks: safeNumber(input.mp4.audioSampleTimestampRollbacks),
      audioSampleTimestampDuplicates: safeNumber(input.mp4.audioSampleTimestampDuplicates),
      audioFidelityVerified: false,
      tailSamplesRead: safeNumber(input.mp4.tailSamplesRead),
      tailEstimatedSampleFps: safeNumber(input.mp4.tailEstimatedSampleFps),
      tailSampleNearDeclaredEnd: input.mp4.tailSampleNearDeclaredEnd === true,
      rotationDegrees: safeNumber(input.mp4.rotationDegrees),
      fileEndVerified: false,
      audioSamplesDecoded: false,
    } : null,
  };
}
