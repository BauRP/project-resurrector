import { isModeEvidence, type ModeEvidence } from "./camera-passport";
import type { TestMode } from "./mode-verification";

export type CameraQueueStatus = "pending" | "running" | "verified" | "recorded" | "retry" | "deferred" | "error";
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
    ["pending", "running", "verified", "recorded", "retry", "deferred", "error"].includes(t.status ?? "");
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
  // A real file or decoder attempt is meaningful evidence, but its encoded
  // FPS is not yet verified. Do not silently re-run a heavy test every time
  // the quick diagnostic panel opens.
  const recordedKeys = new Set(evidence.filter(isModeEvidence)
    .filter(row => row.api === "webview" && row.state === "recorded")
    .map(row => cameraTaskKey(row.cameraId, row.requested)));
  for (const cameraId of activeIds) {
    for (const mode of modes) {
      const key = cameraTaskKey(cameraId, mode);
      const prior = tasks.get(key);
      const confirmed = verifiedKeys.has(key);
      // Persisted queue labels are never evidence on their own. A previously
      // recorded/verified result must be retried when the current passport
      // no longer provides that proof (WebView upgrade, lens change, etc.).
      const oldProofExpired = prior?.status === "recorded" || prior?.status === "verified";
      const status: CameraQueueStatus = confirmed ? "verified" :
        recordedKeys.has(key) ? "recorded" :
        oldProofExpired || prior?.status === "running" ? "retry" :
        prior?.status ?? "pending";
      tasks.set(key, { key, cameraId, mode, status, attempts: prior?.attempts ?? 0,
        checkedAt: prior?.checkedAt ?? null,
        message: confirmed ? "Режим проверен" :
          recordedKeys.has(key) ? "Файл получен; кодированный FPS не подтверждён" :
          oldProofExpired ? "Актуальное подтверждение отсутствует; требуется повторная проверка" :
          prior?.message ?? "Ожидает" });
    }
  }
  return [...tasks.values()].slice(-500);
}
/** Quick scan tests at most one pending mode per lens per invocation.
 * Spreads bounded recording effort over distinct cameras. Remaining tasks
 * stay queued for a future quick pass or user-approved full verification.
 */
export function selectQuickCameraTasks(
  eligible: readonly CameraTestTask[], maxCameras = 2,
  allTasks: readonly CameraTestTask[] = eligible,
): CameraTestTask[] {
  if (!Number.isSafeInteger(maxCameras) || maxCameras <= 0) return [];
  // Count completed and incomplete attempts across ALL modes, including
  // recorded-only ones which are intentionally excluded from eligibility.
  // This prevents an untested tele/ultrawide lens from starving behind a
  // previously examined main camera on every two-probe quick scan.
  const attemptsByCamera = new Map<string, number>();
  for (const task of allTasks)
    attemptsByCamera.set(task.cameraId, (attemptsByCamera.get(task.cameraId) ?? 0) + task.attempts);
  const preferred = new Map<string, CameraTestTask>();
  for (const task of eligible) {
    const current = preferred.get(task.cameraId);
    if (!current || task.attempts < current.attempts ||
      (task.attempts === current.attempts &&
        (task.checkedAt ?? 0) < (current.checkedAt ?? 0))) preferred.set(task.cameraId, task);
  }
  const candidates = [...preferred.values()];
  // The stable original device enumeration breaks ties without inventing
  // physical camera order or favoring a specific manufacturer.
  return candidates.sort((a,b) =>
    (attemptsByCamera.get(a.cameraId) ?? 0) - (attemptsByCamera.get(b.cameraId) ?? 0))
    .slice(0,maxCameras);
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
  total: number; verified: number; recorded: number; pending: number; failed: number; deferred: number;
} {
  const ids = new Set(deviceIds);
  const relevant = queue.filter(t => ids.has(t.cameraId));
  return {
    total: relevant.length,
    verified: relevant.filter(t => t.status === "verified").length,
    recorded: relevant.filter(t => t.status === "recorded").length,
    pending: relevant.filter(t => ["pending","running","retry"].includes(t.status)).length,
    failed: relevant.filter(t => t.status === "error").length,
    deferred: relevant.filter(t => t.status === "deferred").length,
  };
}
