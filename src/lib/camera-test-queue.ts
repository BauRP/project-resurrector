import type { ModeEvidence } from "./camera-passport";
import type { TestMode } from "./mode-verification";

export type CameraQueueStatus = "pending" | "running" | "verified" | "retry" | "deferred" | "error";
export interface CameraTestTask {
  key: string;
  cameraId: string;
  mode: TestMode;
  status: CameraQueueStatus;
  attempts: number;
  checkedAt: number | null;
  message: string;
}
const KEY = "multicam-diagnostic-queue-v1";
export function cameraTaskKey(cameraId: string, mode: TestMode): string {
  return [cameraId, mode.width, mode.height, mode.fps].join("|");
}
const isTask = (value: unknown): value is CameraTestTask => {
  if (!value || typeof value !== "object") return false;
  const t = value as Partial<CameraTestTask>;
  return typeof t.cameraId === "string" && !!t.cameraId &&
    t.key === cameraTaskKey(t.cameraId, t.mode as TestMode) &&
    !!t.mode && Number.isFinite(t.mode.width) && Number.isFinite(t.mode.height) &&
    Number.isFinite(t.mode.fps) && typeof t.attempts === "number" &&
    ["pending", "running", "verified", "retry", "deferred", "error"].includes(t.status ?? "");
};
export function loadCameraTestQueue(): CameraTestTask[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(isTask).slice(-500);
  } catch { return []; }
}
export function persistCameraTestQueue(queue: readonly CameraTestTask[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(queue.slice(-500))); return true; }
  catch { return false; }
}

/** Merge previously attempted tasks with per-device candidate modes.
 * A task may only become verified from concrete ModeEvidence for the SAME
 * WebView device + exact resolution/FPS, never from hardware declarations.
 * "running" from a previous app session is retried, never considered passed.
 */
export function prepareCameraTestQueue(
  deviceIds: readonly string[],
  modes: readonly TestMode[],
  previous: readonly CameraTestTask[],
  evidence: readonly ModeEvidence[],
): CameraTestTask[] {
  const tasks = new Map(previous.filter(isTask).map(task => [task.key, task]));
  for (const cameraId of new Set(deviceIds.filter(Boolean))) {
    for (const mode of modes) {
      const key = cameraTaskKey(cameraId, mode);
      const prior = tasks.get(key);
      const confirmed = evidence.some(row => row.api === "webview" && row.cameraId === cameraId &&
        row.state === "verified" && row.requested.width === mode.width &&
        row.requested.height === mode.height && row.requested.fps === mode.fps);
      const status: CameraQueueStatus = confirmed ? "verified" :
        prior?.status === "running" || prior?.status === "verified" ? "retry" :
        prior?.status ?? "pending";
      tasks.set(key, { key, cameraId, mode, status, attempts: prior?.attempts ?? 0,
        checkedAt: prior?.checkedAt ?? null,
        message: confirmed ? "Записанный тестовый файл подтверждён" : prior?.message ?? "Ожидает" });
    }
  }
  return [...tasks.values()].slice(-500);
}
export function updateCameraTestTask(
  tasks: readonly CameraTestTask[], key: string, status: CameraQueueStatus, message: string,
  checkedAt = Date.now(),
): CameraTestTask[] {
  return tasks.map(task => task.key !== key ? task : {
    ...task, status, message, checkedAt,
    attempts: task.attempts + (status === "running" ? 1 : 0),
  });
}
export function queueSummary(queue: readonly CameraTestTask[], deviceIds: readonly string[]): {
  total: number; verified: number; pending: number; failed: number; deferred: number;
} {
  const ids = new Set(deviceIds);
  const relevant = queue.filter(t => ids.has(t.cameraId));
  return {
    total: relevant.length,
    verified: relevant.filter(t => t.status === "verified").length,
    pending: relevant.filter(t => ["pending","running","retry"].includes(t.status)).length,
    failed: relevant.filter(t => t.status === "error").length,
    deferred: relevant.filter(t => t.status === "deferred").length,
  };
}
