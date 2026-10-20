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