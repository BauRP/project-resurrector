/** Privacy-preserving, strictly allowlisted diagnostic export.
 * A local Camera2/WebView camera identifier, lens label, file path, raw error
 * text, user agent or microphone identifier must NEVER be serialized.
 * Reports contain no photo/video/audio bytes and never contact a server.
 */
import type { ModeEvidence } from "./camera-passport";
import type { NativeCameraProfile, NativeMp4Inspection } from "./native";

export interface DiagnosticExportInput {
  nativeCameras: readonly NativeCameraProfile[];
  modes: readonly ModeEvidence[];
  mp4: NativeMp4Inspection | null;
  checkedAt: string;
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
      highSpeedDeclared: cam.highSpeed.map(m => ({
        // Formats contain numeric resolution only, no paths/identifiers.
        size: /^\d{1,5}x\d{1,5}$/.test(m.size) ? m.size : "unknown",
        fps: m.fps.filter(n => Number.isFinite(n) && n > 0 && n <= 960),
      })),
    })),
    webviewModes: input.modes.map(test => ({
      camera: webview(test.cameraId),
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
      audioSamplesDecoded: false,
    } : null,
  };
}
