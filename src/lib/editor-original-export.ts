import type { EditorExportConfig } from "./editor-render-bridge";

export interface ExportableTimelineItem {
  kind: "video" | "audio"; start: number; in: number; out: number;
  speed: number; reverse: boolean; look: string; opacity: number;
  scale: number; posX: number; mediaId: string;
}
export type OriginalExportDecision = { allowed: true } | { allowed: false; reason: string };
/** Lossless original export is honest only for one complete, untouched source.
 * More advanced timelines need a real compositor and encoder, not a timer.
 */
export function canExportOriginalClip(
  items: readonly ExportableTimelineItem[], overlays: number, transitions: number,
  sourceDuration: number, config: EditorExportConfig,
): OriginalExportDecision {
  if (items.length !== 1 || items[0]?.kind !== "video")
    return {allowed:false,reason:"Для нескольких дорожек необходим полноценный видеорендерер. Экспорт оригинала доступен только для одного клипа."};
  const item=items[0];
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0 ||
      !Number.isFinite(item.in) || !Number.isFinite(item.out) ||
      item.in > .05 || Math.abs(item.out-sourceDuration) > .15 || item.start > .05 ||
      item.speed !== 1 || item.reverse || item.look !== "Без цвета" ||
      item.opacity !== 100 || item.scale !== 100 || item.posX !== 0 ||
      overlays !== 0 || transitions !== 0)
    return {allowed:false,reason:"В проекте есть монтаж или эффекты. Экспорт оригинала их не применяет; нужен отдельный видеорендерер."};
  if (!config || !config.aspect || !config.fps || !config.resolution)
    return {allowed:false,reason:"Параметры экспорта неизвестны."};
  return {allowed:true};
}
