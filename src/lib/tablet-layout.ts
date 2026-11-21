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
}

/** A tablet layout is deliberately unavailable in narrow multi-window panes,
 * with an on-screen keyboard reducing available space, or where a genuine
 * folding feature is present. Those states retain existing safe phone/fold UI.
 */
export function tabletLayoutForWindow(input: TabletWindow): TabletLayout {
  const {width,height,reportedFoldCount,nativeReportValid}=input;
  if (!Number.isFinite(width) || !Number.isFinite(height) ||
      width<=0 || height<=0 || width>10000 || height>10000) return "none";
  if (nativeReportValid===false || (reportedFoldCount!==undefined &&
      (!Number.isSafeInteger(reportedFoldCount) || reportedFoldCount<0 ||
        reportedFoldCount>0))) return "none";
  // Use logical CSS pixels of the APP, never physical panel resolution.
  // 600x900 is a plausible portrait tablet window; 1000x650 landscape.
  if (height>width && width>=600 && height>=740) return "portrait";
  if (width>height && width>=960 && height>=600) return "landscape";
  return "none";
}
