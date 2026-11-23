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
  /** Versioned integrity of each saved per-camera encoder declaration. */
  codecIntegrityVersion?: number;
  /** Derived by Android from every durable per-camera JSON record. */
  codecRowsValid?: boolean;
  planRowsValid?: boolean;
  codecCompleted?: number;
  codecTotal?: number;
  planState?: "pending" | "running" | "retry" | "complete";
  planVersion?: number;
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
  // All THREE persisted declaration stages belong to this progress bar:
  // Camera2 metadata, declared encoder compatibility, and candidate plan.
  // A plan under construction must never display "100%" just because the
  // first two phases completed. Advanced real recordings remain separate.
  if (cameraAuditPlanComplete(audit)) return 100;
  if (total === 0) return 0;
  const metadataSteps = Math.min(completed, total);
  const metadataReady = metadataDone && completed === total;
  const codecSteps = metadataReady && Number.isSafeInteger(audit.codecCompleted) &&
    audit.codecTotal === total && (audit.codecCompleted ?? 0) >= 0
      ? Math.min(audit.codecCompleted ?? 0, total) : 0;
  const codecReady = codecDone && audit.codecIntegrityVersion === 1 &&
    audit.codecRowsValid === true &&
    metadataReady && audit.codecTotal === total &&
    audit.codecCompleted === total;
  const planSteps = codecReady && audit.planVersion === 2 &&
    audit.planTotal === total && audit.planState !== "pending" &&
    Number.isSafeInteger(audit.planCompleted) && (audit.planCompleted ?? 0) >= 0
      ? Math.min(audit.planCompleted ?? 0, total) : 0;
  return Math.max(0, Math.min(99, Math.floor(100 *
    (metadataSteps + codecSteps + planSteps) / (3 * total))));
}

/** Declared functional trial plan is an extra saved stage, never proof
 * of captured media. A stale 'complete' label without matching counters
 * cannot hide the Camera tab progress or skip the next incremental scan.
 */
export function cameraAuditPlanComplete(audit:CameraAuditCheckpoint): boolean {
  return cameraAuditPhase(audit) === "done" &&
    audit.codecIntegrityVersion === 1 &&
    audit.codecRowsValid === true && audit.planRowsValid === true &&
    audit.planState === "complete" && audit.planVersion === 2 &&
    Number.isSafeInteger(audit.planTotal) && (audit.planTotal ?? -1) >= 0 &&
    audit.planTotal === audit.total &&
    Number.isSafeInteger(audit.planCompleted) && (audit.planCompleted ?? -1) >= 0 &&
    audit.planCompleted === audit.total;
}

export function cameraAuditPhase(audit:CameraAuditCheckpoint): "metadata" | "codecs" | "done" {
  // A partial or poisoned atomic checkpoint (including -1/-1) must
  // never be marked completed merely because two corrupt values match.
  if (!Number.isSafeInteger(audit.total) || audit.total < 0 ||
      !Number.isSafeInteger(audit.completed) || audit.completed < 0 ||
      audit.state !== "complete" || audit.completed !== audit.total)
    return "metadata";
  return audit.codecState === "complete" && audit.codecIntegrityVersion === 1 &&
      audit.codecRowsValid === true &&
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
