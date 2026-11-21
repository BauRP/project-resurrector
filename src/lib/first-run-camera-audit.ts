import { registerPlugin } from "@capacitor/core";
import { bounded } from "./async";

/** Camera2 metadata inventory is not a functional recording test. */
export interface CameraAuditCheckpoint {
  schema: number;
  state: "not-started" | "running" | "retry" | "complete";
  completed: number;
  total: number;
  androidSdk?: number;
  advancedState: "pending";
  /** Encoder compatibility is a separate saved stage, not a real video test. */
  codecState?: "pending" | "running" | "retry" | "complete";
  codecCompleted?: number;
  codecTotal?: number;
  planState?: "pending" | "running" | "retry" | "complete";
  planCompleted?: number;
  planTotal?: number;
  planCandidateCount?: number;
  planError?: string;
  activeCameraIds?: string[];
  /** Distinct counts. Never add logical IDs to physical sensors. */
  camera2EnumeratedIdCount?: number;
  physicalIdsDisclosed?: number;
  recordingValidated?: false;
  camera2InventoryOnly?: true;
  cameras: Record<string, {
    cameraId: string;
    source: "android-camera2-metadata";
    verifiedRecording: false;
    state: "metadata-collected" | "unavailable";
    facing?: "front" | "back" | "external" | "unknown";
    physicalCameraIds?: string[];
    metadataOnly?: true;
    isoRange?: [number,number] | null;
    sensorFpsRangesDeclared?: [number,number][];
    videoModeCandidatesDeclared?: {width:number;height:number;minimumFrameDurationNs:number|null;theoreticalUpperFps:number|null;verifiedVideoRecording:false}[];
    stillPhotoSizesDeclared?: {width:number;height:number}[];
    afModesDeclared?: number[];
    aeModesDeclared?: number[];
    awbModesDeclared?: number[];
    codecState?: "complete";
    codecCheckedAt?: number;
    planState?: "complete";
    planVersion?: number;
    planCheckedAt?: number;
    planEvidence?: "declared-compatible-only";
    planCodecCheckedAt?: number;
    functionalPipeline?: {
      sensor:"metadata-only";preview:"not-run";
      encoder:"candidate-only"|"unknown";file:"not-run";
      editor:"not-run";export:"not-run";
    };
    functionalPlan?: {key:string;cameraId:string;width:number;height:number;fps:number;
      encoderName:string;encoderMime:string;status:"not-run";verifiedRecording:false;
      evidence:"declared-compatible-only"}[];
    codecChecks?: {
      width: number;
      height: number;
      fpsRequested: number;
      recordedAndVerified: false;
      status: "declared-compatible" | "not-declared-by-camera" | "not-declared-by-encoder" | "unknown";
      encoders: { name: string; mime: string; declaredOnly: true }[];
    }[];
  }>;
  updatedAt?: number;
  error?: string;
  codecError?: string;
}
interface CameraAuditPlugin {
  getStatus(): Promise<{audit:CameraAuditCheckpoint}>;
  getPassport(): Promise<{audit:CameraAuditCheckpoint}>;
  startIfNeeded(): Promise<{started:boolean;reason?:string}>;
}
const plugin = registerPlugin<CameraAuditPlugin>("CameraAudit");

export function cameraAuditProgress(audit:CameraAuditCheckpoint): number {
  const total = audit.total;
  const completed = audit.completed;
  if (!Number.isSafeInteger(total) || total < 0 ||
      !Number.isSafeInteger(completed) || completed < 0) return 0;
  const metadataDone = audit.state === "complete";
  const codecDone = audit.codecState === "complete";
  // Old valid passports are upgraded to codec checks without losing
  // already collected Camera2 metadata. Zero-camera phones are supported.
  if (metadataDone && codecDone && completed === total &&
      audit.codecTotal === total && audit.codecCompleted === total) return 100;
  if (total === 0) return 0;
  const metadataSteps = Math.min(completed, total);
  const codecSteps = metadataDone && Number.isSafeInteger(audit.codecCompleted) &&
    Number.isSafeInteger(audit.codecTotal) && (audit.codecTotal ?? 0) > 0
      ? Math.min(Math.max(0, audit.codecCompleted ?? 0), audit.codecTotal ?? 0) : 0;
  const codecTotal = metadataDone && Number.isSafeInteger(audit.codecTotal) &&
    (audit.codecTotal ?? 0) > 0 ? audit.codecTotal! : total;
  return Math.max(0, Math.min(99, Math.floor(100 * (metadataSteps + codecSteps) /
    (total + codecTotal))));
}

/** Declared functional trial plan is an extra saved stage, never proof
 * of captured media. A stale 'complete' label without matching counters
 * cannot hide the Camera tab progress or skip the next incremental scan.
 */
export function cameraAuditPlanComplete(audit:CameraAuditCheckpoint): boolean {
  return cameraAuditPhase(audit) === "done" &&
    audit.planState === "complete" &&
    Number.isSafeInteger(audit.planTotal) && audit.planTotal === audit.total &&
    Number.isSafeInteger(audit.planCompleted) && audit.planCompleted === audit.total;
}

export function cameraAuditPhase(audit:CameraAuditCheckpoint): "metadata" | "codecs" | "done" {
  if (audit.state !== "complete" ||
      audit.completed !== audit.total) return "metadata";
  return audit.codecState === "complete" &&
      audit.codecTotal === audit.total && audit.codecCompleted === audit.total
        ? "done" : "codecs";
}

/** Human-readable pause reason; never translate OEM unknown into unsupported. */
export function cameraAuditPauseReason(audit: CameraAuditCheckpoint): string | null {
  const reason = audit.state === "retry" ? audit.error :
    audit.codecState === "retry" ? audit.codecError :
    audit.planState === "retry" ? audit.planError : undefined;
  switch (reason) {
    case "thermal-severe":
      return "Сильный нагрев. Проверка приостановлена, результаты сохранены.";
    case "low-memory":
      return "Мало свободной оперативной памяти. Проверка продолжится позднее.";
    case "camera-metadata-temporarily-unavailable":
      return "Android временно не предоставил характеристики всех камер.";
    default:
      return null;
  }
}

export const cameraAudit = {
  getStatus: () => bounded(plugin.getStatus(), 2500, "Camera audit status"),
  getPassport: () => bounded(plugin.getPassport(), 5000, "Camera audit passport"),
  startIfNeeded: () => plugin.startIfNeeded(),
};
