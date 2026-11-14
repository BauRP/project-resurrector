import { selectEditorClipDuration } from "./editor-media-duration";

/** A completed WebView frame is real evidence of source availability. Older
 * Android WebM decoders can report duration=Infinity even for a finite clip;
 * use a confirmed duration saved alongside the UNCHANGED original instead.
 * Unknown duration is not silently assumed to match a requested trim.
 */
export function canExportSegmentThrough(
  webViewDuration: number,
  storedOriginalDuration: number | undefined,
  requestedSourceEnd: number,
): boolean {
  const known = selectEditorClipDuration(webViewDuration, storedOriginalDuration);
  return known !== null && Number.isFinite(requestedSourceEnd) &&
    requestedSourceEnd > 0 && known + .12 >= requestedSourceEnd;
}

/** Normal source.onended may precede the next requestAnimationFrame at a
 * trimmed source boundary. Allow normal completion only at the trim end. */
export function reachedExportTrimEnd(currentTime:number, sourceOut:number):boolean {
  return Number.isFinite(currentTime)&&Number.isFinite(sourceOut)&&sourceOut>0 &&
    currentTime+.12>=sourceOut;
}
