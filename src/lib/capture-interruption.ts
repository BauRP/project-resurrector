/** Durable warning only. This does NOT save or restore camera bytes:
 * IndexedDB media stays independent and must be inspected by the user.
 */
const KEY="multicam-unfinished-recorder-v1";
export interface CaptureInterruption {
  kind: "single"|"dual";
  startedAt: number;
}
export function readUnfinishedCapture(): CaptureInterruption | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 512) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const v = data as Partial<CaptureInterruption>;
    if ((v.kind !== "single" && v.kind !== "dual") ||
        typeof v.startedAt !== "number" || !Number.isSafeInteger(v.startedAt) ||
        v.startedAt <= 0) return null;
    return { kind:v.kind, startedAt:v.startedAt };
  } catch { return null; }
}
export function markUnfinishedCapture(kind: CaptureInterruption["kind"], startedAt: number): void {
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0) return;
  try { localStorage.setItem(KEY, JSON.stringify({kind,startedAt})); } catch { /* storage denied */ }
}
export function clearUnfinishedCapture(kind: CaptureInterruption["kind"], startedAt: number): void {
  const stored = readUnfinishedCapture();
  if (stored?.kind !== kind || stored.startedAt !== startedAt) return;
  try { localStorage.removeItem(KEY); } catch { /* leave warning */ }
}
