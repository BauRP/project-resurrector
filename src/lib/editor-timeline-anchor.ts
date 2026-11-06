/** Preserve a timeline's content-time anchor instead of raw CSS pixels.
 * A fold or split-screen resize changes zoom and viewport width; restoring
 * pixel offsets would jump to a different clip.
 */
const KEY = "multicam-editor-timeline-anchor-v1";
export function timelineAnchorFromScroll(left: number, zoom: number): number | null {
  if (!Number.isFinite(left) || !Number.isFinite(zoom) || left < 0 || zoom <= 0) return null;
  const time = left / zoom;
  return Number.isFinite(time) && time >= 0 && time <= 86400 ? time : null;
}
export function scrollForTimelineAnchor(time: number | null, zoom: number, width: number, scrollWidth: number): number {
  if (time === null || !Number.isFinite(time) || time < 0 || time > 86400 ||
      !Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(width) || width < 0 ||
      !Number.isFinite(scrollWidth) || scrollWidth < 0) return 0;
  return Math.min(Math.max(0, scrollWidth - width), time * zoom);
}
export function saveTimelineAnchor(left: number, zoom: number): boolean {
  try {
    const time = timelineAnchorFromScroll(left, zoom);
    if (time === null || typeof localStorage === "undefined") return false;
    localStorage.setItem(KEY, String(time));
    return true;
  } catch { return false; }
}
export function readTimelineAnchor(): number | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 30) return null;
    const time = Number(raw);
    return Number.isFinite(time) && time >= 0 && time <= 86400 ? time : null;
  } catch { return null; }
}
