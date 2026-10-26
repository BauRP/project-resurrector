/**
 * Passive evidence of Android fold transitions observed DURING video capture.
 * Reporting a posture never proves unbroken encoded frames. Recorder storage
 * and video decode evidence are separate.
 */
export interface FoldTransitionEvidence {
  revision: number;
  observedAtMs: number;
  posture: string;
  hingeCount: number;
  usableRegions: number;
  layout: "none" | "vertical" | "horizontal";
  regionGeometry?: string;
}
export const FOLD_EVENT = "multicam-fold-topology";
/** Reject corrupted geometry, not just oversized metadata. Native pane values
 * are rounded to CSS pixels. Only non-negative finite rectangular regions
 * from the measured application window are acceptable as capture evidence.
 */
export function validFoldRegionGeometry(value: string): boolean {
  if (!value || value.length > 512) return false;
  const panes = value.split(";");
  if (panes.length > 16) return false;
  return panes.every(pane => {
    const values = pane.split(",");
    if (values.length !== 4) return false;
    const numbers = values.map(Number);
    return values.every(value => /^-?\d+$/.test(value)) &&
      numbers.every(Number.isSafeInteger) &&
      numbers[0]! >= 0 && numbers[1]! >= 0 &&
      numbers[2]! > 0 && numbers[3]! > 0;
  });
}
export function normalizeFoldTransition(value: unknown, observedAtMs: number): FoldTransitionEvidence | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (!Number.isSafeInteger(event.revision) || Number(event.revision) < 0 ||
      typeof event.posture !== "string" || event.posture.length > 512 ||
      !Number.isFinite(observedAtMs) || observedAtMs <= 0 ||
      !Number.isSafeInteger(event.hingeCount) || Number(event.hingeCount) < 0 ||
      !Number.isSafeInteger(event.usableRegions) || Number(event.usableRegions) < 1 || Number(event.usableRegions) > 16 ||
      Number(event.hingeCount) > 16 ||
      !["none", "vertical", "horizontal"].includes(String(event.layout)) ||
      (event.regionGeometry !== undefined &&
        (typeof event.regionGeometry !== "string" || !validFoldRegionGeometry(event.regionGeometry)))) return null;
  return {
    revision: event.revision as number,
    observedAtMs, posture: event.posture,
    hingeCount: event.hingeCount as number,
    usableRegions: event.usableRegions as number,
    layout: event.layout as FoldTransitionEvidence["layout"],
    regionGeometry: typeof event.regionGeometry === "string" ? event.regionGeometry : undefined,
  };
}
/** Avoid duplicate initial native topology callbacks or unbounded metadata. */
export function appendFoldTransition(
  events: readonly FoldTransitionEvidence[], value: FoldTransitionEvidence,
): FoldTransitionEvidence[] {
  const last = events[events.length - 1];
  // Ignore delayed/stale events before deciding whether they are duplicates.
  // A newer native revision with the same observed physical geometry is NOT
  // another fold. Keep its revision as the chronology watermark.
  if (last && (value.revision < last.revision ||
      value.observedAtMs < last.observedAtMs)) return [...events];
  if (last &&
      last.posture === value.posture &&
      last.hingeCount === value.hingeCount &&
      last.usableRegions === value.usableRegions &&
      last.layout === value.layout &&
      last.regionGeometry === value.regionGeometry)
    return value.revision === last.revision ? [...events] :
      [...events.slice(0,-1), { ...last, revision:value.revision }];
  return [...events, value].slice(-120);
}
export function foldContinuitySummary(events: readonly FoldTransitionEvidence[]): string {
  if (!events.length) return "Во время записи данные о складках недоступны: непрерывность не подтверждена.";
  const changes = Math.max(0, events.length - 1);
  return "Зафиксировано изменений геометрии: " + changes +
    ". Журнал не подтверждает непрерывность кадров или сохранение записи при повороте.";
}
