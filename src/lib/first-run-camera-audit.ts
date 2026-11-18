import { registerPlugin } from "@capacitor/core";

/** Camera2 metadata inventory is not a functional recording test. */
export interface CameraAuditCheckpoint {
  schema: number;
  state: "not-started" | "running" | "retry" | "complete";
  completed: number;
  total: number;
  androidSdk?: number;
  advancedState: "pending";
  cameras: Record<string, {
    cameraId: string;
    source: "android-camera2-metadata";
    verifiedRecording: false;
    state: "metadata-collected" | "unavailable";
    facing?: "front" | "back" | "external" | "unknown";
    physicalCameraIds?: string[];
  }>;
  updatedAt?: number;
  error?: string;
}
interface CameraAuditPlugin {
  getStatus(): Promise<{audit:CameraAuditCheckpoint}>;
  startIfNeeded(): Promise<{started:boolean;reason?:string}>;
}
const plugin = registerPlugin<CameraAuditPlugin>("CameraAudit");

export function cameraAuditProgress(audit:CameraAuditCheckpoint): number {
  if (audit.state === "complete") return 100;
  if (!Number.isSafeInteger(audit.completed) || !Number.isSafeInteger(audit.total) || audit.total <= 0) return 0;
  return Math.max(0, Math.min(99, Math.floor(100 * audit.completed / audit.total)));
}

export const cameraAudit = {
  getStatus: () => plugin.getStatus(),
  startIfNeeded: () => plugin.startIfNeeded(),
};
