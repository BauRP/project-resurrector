export type VerificationState = "declared" | "accessible" | "implemented" | "compatible" | "applied" | "recorded" | "verified" | "rejected" | "unknown";
export interface ModeEvidence {
  cameraId: string;
  api: "webview" | "camera2";
  requested: { width: number; height: number; fps: number };
  applied?: { width?: number; height?: number; fps?: number };
  /** Decoded first video frame metadata, not hardware-sensor or codec-FPS proof. */
  file?: { width: number; height: number; bytes: number; mimeType: string };
  state: VerificationState;
  message?: string;
  checkedAt: number;
}
const KEY = "multicam-mode-evidence-v1";
const STATES = ["declared","accessible","implemented","compatible","applied","recorded","verified","rejected","unknown"];
export function isModeEvidence(value: unknown): value is ModeEvidence {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<ModeEvidence>;
  const m = e.requested;
  if (!m || typeof m !== "object") return false;
  return (e.api === "webview" || e.api === "camera2") &&
    typeof e.cameraId === "string" && e.cameraId.length > 0 && e.cameraId.length < 513 &&
    Number.isSafeInteger(m.width) && Number(m.width) > 0 &&
    Number.isSafeInteger(m.height) && Number(m.height) > 0 &&
    typeof m.fps === "number" && Number.isFinite(m.fps) && m.fps > 0 &&
    STATES.includes(e.state ?? "") &&
    typeof e.checkedAt === "number" && Number.isFinite(e.checkedAt) && e.checkedAt > 0 &&
    (e.applied === undefined || (e.applied !== null && typeof e.applied === "object" &&
      Object.values(e.applied).every(x => x === undefined || (typeof x === "number" && Number.isFinite(x) && x > 0)))) &&
    (e.message === undefined || typeof e.message === "string") &&
    (e.file === undefined || (!!e.file &&
      Number.isSafeInteger(e.file.width) && e.file.width > 0 &&
      Number.isSafeInteger(e.file.height) && e.file.height > 0 &&
      Number.isSafeInteger(e.file.bytes) && e.file.bytes >= 1024 &&
      typeof e.file.mimeType === "string" && e.file.mimeType.length < 256));
}
const identity = (row: ModeEvidence) =>
  [row.api, row.cameraId, row.requested.width, row.requested.height, row.requested.fps].join("|");
/** Previously stored data may be malformed after a partial write or app upgrade. */
export function loadModeEvidence(): ModeEvidence[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isModeEvidence).slice(-200) : [];
  } catch { return []; }
}
export function recordModeEvidence(evidence: ModeEvidence): void {
  if (!isModeEvidence(evidence)) return;
  try {
    const stored = loadModeEvidence();
    const previous = stored.filter(row => identity(row) !== identity(evidence));
    // An interrupted probe or older timestamp must never overwrite a recent
    // decoded sample, especially if an old async callback arrives late.
    const current = stored.find(row => identity(row) === identity(evidence));
    if (current && current.checkedAt > evidence.checkedAt) return;
    if (current?.state === "verified" && evidence.state === "unknown") return;
    localStorage.setItem(KEY, JSON.stringify([...previous.slice(-199), evidence]));
  } catch { /* Local storage unavailable: never claim a durable passport. */ }
}
