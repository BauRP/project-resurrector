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
  activeCameraIds?: string[];
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
  if (metadataDone && codecDone) return 100;
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

export function cameraAuditPhase(audit:CameraAuditCheckpoint): "metadata" | "codecs" | "done" {
  if (audit.state !== "complete") return "metadata";
  return audit.codecState === "complete" ? "done" : "codecs";
}

export const cameraAudit = {
  getStatus: () => bounded(plugin.getStatus(), 2500, "Camera audit status"),
  getPassport: () => bounded(plugin.getPassport(), 5000, "Camera audit passport"),
  startIfNeeded: () => plugin.startIfNeeded(),
};
