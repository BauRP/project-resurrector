import { isModeEvidence, type ModeEvidence } from "./camera-passport";
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
  if (typeof t.cameraId !== "string" || !t.cameraId || !t.mode || typeof t.mode !== "object") return false;
  const m = t.mode as Partial<TestMode>;
  return Number.isSafeInteger(m.width) && Number(m.width) > 0 &&
    Number.isSafeInteger(m.height) && Number(m.height) > 0 &&
    typeof m.fps === "number" && Number.isFinite(m.fps) && m.fps > 0 &&
    t.key === cameraTaskKey(t.cameraId, m as TestMode) &&
    Number.isSafeInteger(t.attempts) && Number(t.attempts) >= 0 &&
    (t.checkedAt === null || (typeof t.checkedAt === "number" && Number.isFinite(t.checkedAt))) &&
    typeof t.message === "string" &&
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
  const activeIds = new Set(deviceIds.filter(Boolean));
  // Keep previous tasks only for cameras currently exposed by WebView.
  // Disconnected devices must not push active tests out of a capped queue.
  const tasks = new Map(previous.filter(isTask).filter(task => activeIds.has(task.cameraId))
    .map(task => [task.key, task]));
  const verifiedKeys = new Set(evidence.filter(isModeEvidence)
    .filter(row => row.api === "webview" && row.state === "verified")
    .map(row => cameraTaskKey(row.cameraId, row.requested)));
  for (const cameraId of activeIds) {
    for (const mode of modes) {
      const key = cameraTaskKey(cameraId, mode);
      const prior = tasks.get(key);
      const confirmed = verifiedKeys.has(key);
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
