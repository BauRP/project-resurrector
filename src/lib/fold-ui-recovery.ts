/** Preserve only lightweight interface choices across Android Activity/WebView
 * recreation. Never restore a MediaRecorder, camera lease, recording flag,
 * camera capability, or an unverified device-specific setting from storage.
 */
export interface RestorableViewState {
  tab: "camera" | "editor" | "settings";
  playhead: number;
  editMode: string;
  aspect: string;
  captureKind: "photo" | "video";
}
const KEY = "multicam-view-state-v1";

export function sanitizeViewState(value: unknown): Partial<RestorableViewState> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const restored: Partial<RestorableViewState> = {};
  if (source.tab === "camera" || source.tab === "editor" || source.tab === "settings")
    restored.tab = source.tab;
  if (typeof source.playhead === "number" && Number.isFinite(source.playhead) &&
      source.playhead >= 0 && source.playhead <= 86400)
    restored.playhead = source.playhead;
  if (typeof source.editMode === "string" && /^[\w -]{1,32}$/.test(source.editMode))
    restored.editMode = source.editMode;
  if (typeof source.aspect === "string" && /^\d{1,3}:\d{1,3}$/.test(source.aspect))
    restored.aspect = source.aspect;
  if (source.captureKind === "photo" || source.captureKind === "video")
    restored.captureKind = source.captureKind;
  return restored;
}
export function restoreViewState(): Partial<RestorableViewState> {
  try {
    if (typeof localStorage === "undefined") return {};
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 2048) return {};
    return sanitizeViewState(JSON.parse(raw));
  } catch { return {}; }
}
export function saveViewState(value: unknown): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(KEY, JSON.stringify(sanitizeViewState(value)));
    return true;
  } catch { return false; }
}
