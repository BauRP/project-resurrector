/**
 * An identity SVG filter still forces Chromium to composite every decoded
 * video frame through an offscreen texture. On older Android WebView this
 * competes with the decoder and can stall the UI. Skip it ONLY when all
 * numeric color controls are zero. Keep every real user-selected color,
 * preset and transition effect exactly as before.
 */
export function needsEditorColorFilter(color?: Readonly<Record<string, number>>): boolean {
  return !!color && Object.values(color).some(value => value !== 0);
}
export function editorVideoFilter(
  clipId: string,
  color: Readonly<Record<string, number>> | undefined,
  look: string | undefined,
  transition: string,
): string {
  const parts: string[] = [];
  if (needsEditorColorFilter(color)) parts.push(`url(#cc-${clipId})`);
  if (look && look !== "none") parts.push(look);
  if (transition) parts.push(transition);
  return parts.join(" ") || "none";
}
