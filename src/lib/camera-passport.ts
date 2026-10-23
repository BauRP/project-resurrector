export type VerificationState =
  | "declared" | "accessible" | "implemented" | "compatible"
  | "applied" | "recorded" | "verified" | "rejected" | "unknown";
export interface ModeEvidence {
  cameraId: string;
  api: "webview" | "camera2";
  requested: { width: number; height: number; fps: number };
  applied?: { width?: number; height?: number; fps?: number };
  state: VerificationState;
  message?: string;
  checkedAt: number;
}
/** Persist each camera+resolution+fps separately; no pooled front/rear modes. */
const KEY = "multicam-mode-evidence-v1";
export function loadModeEvidence(): ModeEvidence[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((row): row is ModeEvidence =>
      !!row && typeof row === "object" && typeof row.cameraId === "string" && typeof row.checkedAt === "number") : [];
  } catch { return []; }
}
export function recordModeEvidence(evidence: ModeEvidence): void {
  try {
    const key = (row: ModeEvidence) => [row.api, row.cameraId, row.requested.width, row.requested.height, row.requested.fps].join("|");
    const previous = loadModeEvidence().filter((row) => key(row) !== key(evidence));
    localStorage.setItem(KEY, JSON.stringify([...previous.slice(-199), evidence]));
  } catch { /* Storage unavailable: verified mode remains runtime-only. */ }
}
