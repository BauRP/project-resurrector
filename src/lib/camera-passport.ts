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
  /** Diagnostic engine and WebView identity for THIS individual sample. */
  context?: string;
}
const KEY = "multicam-mode-evidence-v1";
// A verified old session is not proof after a WebView or diagnostic engine change.
// Existing results remain readable as historical evidence, but must be retried.
const CONTEXT_KEY = "multicam-mode-evidence-context-v1";
const ENGINE_REVISION = "webview-recorded-frame-v3-no-unverified-coded-fps";
export function cameraPassportContext(): string {
  return ENGINE_REVISION + "|" + (typeof navigator === "undefined" ? "unknown" : navigator.userAgent || "unknown");
}
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
    (e.context === undefined || (typeof e.context === "string" && e.context.length > 0 && e.context.length < 2048)) &&
    (e.file === undefined || (!!e.file &&
      Number.isSafeInteger(e.file.width) && e.file.width > 0 &&
      Number.isSafeInteger(e.file.height) && e.file.height > 0 &&
      Number.isSafeInteger(e.file.bytes) && e.file.bytes >= 1024 &&
      typeof e.file.mimeType === "string" && e.file.mimeType.length < 256));
}
const identity = (row: ModeEvidence) =>
  [row.api, row.cameraId, row.requested.width, row.requested.height, row.requested.fps].join("|");
/** Previously stored data may be malformed after a partial write or app upgrade. */
/** Keep the original measured evidence. An old browser result remains visible,
 * but cannot authorize the current version to skip a camera verification.
 */
function readStoredModeEvidence(): ModeEvidence[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isModeEvidence).slice(-200) : [];
  } catch { return []; }
}
export function loadModeEvidence(): ModeEvidence[] {
  try {
    const context = cameraPassportContext();
    const marker = localStorage.getItem(CONTEXT_KEY);
    return readStoredModeEvidence().map(row => {
      if (marker === context && row.context === context) return row;
      return {
        ...row,
        state: "unknown" as const,
        message: "Требуется повторная проверка после изменения WebView/механизма. " + (row.message ?? ""),
      };
    });
  } catch { return []; }
}
export function recordModeEvidence(evidence: ModeEvidence): void {
  if (!isModeEvidence(evidence)) return;
  try {
    const context = cameraPassportContext();
    const marker = localStorage.getItem(CONTEXT_KEY);
    // Do not materialize loadModeEvidence() here: its 'unknown' status is a
    // temporary view. Preserve historic results and their original context.
    // When an old global marker changes, all older rows belong to that
    // previous environment, including rows previously stamped with current.
    const stored = readStoredModeEvidence().map(row => {
      if (marker !== context && row.context === context) {
        return { ...row, context: marker || "legacy" };
      }
      return row;
    });
    const key = identity(evidence);
    const current = stored.find(row => identity(row) === key);
    // A fresh verification in the new environment always supersedes stale
    // older-context evidence, regardless of unrelated wall-clock timestamps.
    if (current?.context === context && current.checkedAt > evidence.checkedAt) return;
    // A failed, timed-out or interrupted *later* attempt cannot erase a
    // previously confirmed recording for the same lens/mode in this context.
    // The interrupted attempt remains available in the native session
    // diagnostics; the passport retains its strongest successful evidence.
    if (current?.context === context && evidence.state === "unknown" &&
        ["applied","recorded","verified"].includes(current.state)) return;
    const prior = stored.filter(row => identity(row) !== key);
    const next: ModeEvidence = { ...evidence, context };
    localStorage.setItem(KEY, JSON.stringify([...prior.slice(-199), next]));
    localStorage.setItem(CONTEXT_KEY, context);
  } catch { /* A failed localStorage write never fabricates a valid passport. */ }
}
