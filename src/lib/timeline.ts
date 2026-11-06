export function timelineMinZoom(width: number, duration: number, header = 72) {
  return Math.min(600, Math.max(8, width > 0 ? (width - header - 8) / Math.max(10, duration) : 8));
}
export function timelineTime(pixel: number, zoom: number, total: number) {
  return Math.min(total, Math.max(0, pixel / zoom));
}
export function visibleTiles(start: number, width: number, scroll: number, viewport: number, tile = 64) {
  const first = Math.max(0, Math.floor((scroll - start - tile) / tile));
  const end = Math.min(Math.ceil(width / tile), Math.ceil((scroll + viewport - start + tile) / tile));
  return { first, end: Math.max(first, end) };
}
/** Only create tick nodes that can be seen inside the timeline viewport.
 * The ruler remains navigable at every zoom, even for 24-hour recordings.
 * No camera, video, editor lane or marker functionality is removed.
 */
export function visibleRulerTicks(total: number, zoom: number, scroll: number, viewport: number, header = 104): number[] {
  if (![total, zoom, scroll, viewport, header].every(Number.isFinite) ||
      total < 0 || zoom <= 0 || scroll < 0 || viewport <= 0) return [0];
  const baseStep = zoom >= 20 ? 1 : 5;
  // Extremely zoomed-out viewports must not create overlapping labels.
  const step = baseStep * Math.max(1, Math.ceil(viewport / (baseStep * zoom * 150)));
  const first = Math.max(0, (Math.floor(Math.max(0, (scroll - header) / zoom) / step) - 1) * step);
  const last = Math.min(Math.ceil(total), (Math.ceil(Math.max(0, (scroll + viewport - header) / zoom) / step) + 1) * step);
  const ticks: number[] = [];
  for (let second = first; second <= last; second += step) ticks.push(second);
  return ticks;
}
