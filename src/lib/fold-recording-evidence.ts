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
  /** A topology observed before video capture, not a transition during it. */
  baseline?: true;
  /** Count of discarded old observations after the bounded journal filled. */
  omittedEarlierEvents?: number;
}
export const FOLD_EVENT = "multicam-fold-topology";

/** Latest ACTUALLY observed fold layout, owned by the currently mounted
 * display adapter. Recordings may use it as a PRE-CAPTURE baseline, never
 * as proof of uninterrupted video or a fold event during capture.
 */
let activeFoldSnapshot: { owner: symbol; observed: FoldTransitionEvidence } | null = null;
export function rememberActiveFoldSnapshot(owner: symbol, value: unknown, observedAtMs: number): boolean {
  const evidence = normalizeFoldTransition(value, observedAtMs);
  if (!evidence) return false;
  if (activeFoldSnapshot?.owner === owner &&
      (evidence.revision < activeFoldSnapshot.observed.revision ||
       observedAtMs < activeFoldSnapshot.observed.observedAtMs)) return false;
  activeFoldSnapshot = { owner, observed: evidence };
  return true;
}
export function forgetActiveFoldSnapshot(owner: symbol): void {
  if (activeFoldSnapshot?.owner === owner) activeFoldSnapshot = null;
}
export function getActiveFoldBaseline(): FoldTransitionEvidence | null {
  return activeFoldSnapshot ? { ...activeFoldSnapshot.observed, baseline: true } : null;
}

/** Reject corrupted geometry, not just oversized metadata. Native pane values
 * are rounded to CSS pixels. Only non-negative finite rectangular regions
 * from the measured application window are acceptable as capture evidence.
 */
export function validFoldRegionGeometry(value: string): boolean {
  if (!value || value.length > 512) return false;
  const panes = value.split(";");
  if (panes.length > 16) return false;
  const rectangles = panes.map(pane => {
    const values = pane.split(",");
    if (values.length !== 4 || !values.every(value => /^-?\d+$/.test(value))) return null;
    const numbers = values.map(Number);
    if (!numbers.every(Number.isSafeInteger) ||
        numbers[0]! < 0 || numbers[1]! < 0 ||
        numbers[2]! <= 0 || numbers[3]! <= 0 ||
        !Number.isSafeInteger(numbers[0]! + numbers[2]!) ||
        !Number.isSafeInteger(numbers[1]! + numbers[3]!)) return null;
    return { x: numbers[0]!, y: numbers[1]!, w: numbers[2]!, h: numbers[3]! };
  });
  if (rectangles.some(rect => !rect)) return false;
  // Real usable pane rectangles must not overlap.
  for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
    const a = rectangles[i]!, b = rectangles[j]!;
    if (a.x < b.x + b.w && b.x < a.x + a.w &&
        a.y < b.y + b.h && b.y < a.y + a.h) return false;
  }
  return true;
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
      Number(event.hingeCount) > Number(event.usableRegions) - 1 ||
      !["none", "vertical", "horizontal"].includes(String(event.layout)) ||
      (event.regionGeometry !== undefined &&
        (typeof event.regionGeometry !== "string" || !validFoldRegionGeometry(event.regionGeometry) ||
          event.regionGeometry.split(";").length !== Number(event.usableRegions)))) return null;
  return {
    revision: event.revision as number,
    observedAtMs, posture: event.posture,
    hingeCount: event.hingeCount as number,
    usableRegions: event.usableRegions as number,
    layout: event.layout as FoldTransitionEvidence["layout"],
    regionGeometry: typeof event.regionGeometry === "string" ? event.regionGeometry : undefined,
    baseline: event.baseline === true ? true : undefined,
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
  const next = [...events, value];
  if (next.length <= 120) return next;
  // Keep the ORIGINAL measured starting posture for the entire recording.
  // Silently deleting it previously converted a genuine baseline into an
  // unknown starting position after 120 fold/resize observations.
  const baseline = next[0]?.baseline === true;
  const trimmed = baseline
    ? [next[0]!, ...next.slice(-119)]
    : next.slice(-120);
  const previouslyOmitted = events[0]?.omittedEarlierEvents ?? 0;
  trimmed[0] = {
    ...trimmed[0]!,
    omittedEarlierEvents: previouslyOmitted + (next.length - 120),
  };
  return trimmed;
}
export function foldContinuitySummary(events: readonly FoldTransitionEvidence[]): string {
  if (!events.length) return "Во время записи данные о складках недоступны: непрерывность не подтверждена.";
  const omitted = events[0]?.omittedEarlierEvents ?? 0;
  const changes = Math.max(0, events.length - (events[0]?.baseline === true ? 1 : 0)) + omitted;
  // Geometry changes can be ordinary WebView resizing or window-manager
  // adjustments. Count observed hinge/posture changes separately, never
  // infer a real physical fold just from a resized app window.
  let postureChanges = 0;
  let geometryOnlyChanges = 0;
  for (let i = 1; i < events.length; i++) {
    const before = events[i - 1]!, after = events[i]!;
    if (before.hingeCount !== after.hingeCount ||
        before.posture !== after.posture || before.layout !== after.layout)
      postureChanges++;
    else if (before.regionGeometry !== after.regionGeometry ||
             before.usableRegions !== after.usableRegions)
      geometryOnlyChanges++;
  }
  const uncertain = events[0]?.baseline !== true;
  const prefix = uncertain ? "Начальная геометрия на момент старта отсутствует; число изменений частично неизвестно. " : "";
  return prefix + (omitted ? "Ранние наблюдения сокращены в журнале: " + omitted + ". " : "") +
    "Зафиксировано изменений геометрии: " + changes +
    ". Наблюдаемых изменений шарниров/положения: " + postureChanges +
    "; только геометрии окна: " + geometryOnlyChanges +
    ". Это не доказательство физического складывания или непрерывности видеокадров.";
}
