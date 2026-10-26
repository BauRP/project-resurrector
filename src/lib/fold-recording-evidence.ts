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
        (typeof event.regionGeometry !== "string" || event.regionGeometry.length > 512))) return null;
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
  if (last && last.revision === value.revision &&
      last.posture === value.posture &&
      last.hingeCount === value.hingeCount &&
      last.usableRegions === value.usableRegions &&
      last.layout === value.layout &&
      last.regionGeometry === value.regionGeometry) return [...events];
  // Delayed older WindowManager callbacks can arrive after a newer fold.
  // Same-revision CSS viewport changes are valid and remain recorded.
  if (last && (value.revision < last.revision ||
      value.observedAtMs < last.observedAtMs)) return [...events];
  return [...events, value].slice(-120);
}
export function foldContinuitySummary(events: readonly FoldTransitionEvidence[]): string {
  if (!events.length) return "Во время записи данные о складках недоступны: непрерывность не подтверждена.";
  const changes = Math.max(0, events.length - 1);
  return "Зафиксировано изменений геометрии: " + changes +
    ". Журнал не подтверждает непрерывность кадров или сохранение записи при повороте.";
}
