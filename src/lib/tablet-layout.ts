/** Real usable CSS WINDOW geometry, not device branding or a UA string.
 * Tablet-sized Android windows may be portrait, landscape or split-screen.
 * The policy never manufactures WindowManager folds and never locks rotation.
 */
export type TabletLayout = "none" | "portrait" | "landscape";
export interface TabletWindow {
  width: number;
  height: number;
  /** Native report when present; null during bridge startup or on web. */
  reportedFoldCount?: number | undefined;
  nativeReportValid?: boolean | undefined;
  /** Current visible VisualViewport; may shrink while layout viewport is
   * unchanged by Android's keyboard or pinch zoom. */
  visibleHeight?: number | undefined;
  visibleWidth?: number | undefined;
}

/** A tablet layout is deliberately unavailable in narrow multi-window panes,
 * with an on-screen keyboard reducing available space, or where a genuine
 * folding feature is present. Those states retain existing safe phone/fold UI.
 */
export function tabletLayoutForWindow(input: TabletWindow): TabletLayout {
  const {width,height,reportedFoldCount,nativeReportValid,visibleHeight,visibleWidth}=input;
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
      width<=0 || height<=0 || width>10000 || height>10000) return "none";
  if (nativeReportValid===false || (reportedFoldCount!==undefined &&
      (!Number.isSafeInteger(reportedFoldCount) || reportedFoldCount<0 ||
        reportedFoldCount>0))) return "none";
  // Android's soft keyboard often shrinks VisualViewport only. Keep using
  // layout viewport for orientation, but fall back to the compact controls
  // when a keyboard/pinch leaves too little actual visible space.
  // Ignore transient 0/NaN viewport reports during Activity rotation.
  if (typeof visibleHeight === "number" && Number.isFinite(visibleHeight) &&
      visibleHeight > 0 && height - visibleHeight >= Math.max(180,height * .24))
    return "none";
  if (typeof visibleWidth === "number" && Number.isFinite(visibleWidth) &&
      visibleWidth > 0 && width - visibleWidth >= Math.max(160,width * .35))
    return "none";
  // Use logical CSS pixels of the APP, never physical panel resolution.
  // A 600x800 app window can rotate to 800x600 without losing tablet UI.
  // 800 wide x 600 tall still leaves a usable 550px preview beside the
  // 250px recording rail. Do not classify a 780x360 landscape phone.
  if (height>width && width>=600 && height>=740) return "portrait";
  if (width>height && width>=800 && height>=600) return "landscape";
  return "none";
}
