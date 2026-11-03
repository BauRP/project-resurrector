/** Keeps the app's VERTICAL scroll separately for Editor and Settings across
 * tab changes, orientation changes and Android Activity/WebView recreation.
 * Camera is always allowed to start at the top and never persists scroll.
 * This intentionally stores only numbers, not media or camera identities.
 */
export type ScrollTab = "camera" | "editor" | "settings";
export interface ScrollPort {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}
const KEY = "multicam-fold-scroll-v1:";
const MAX_SCROLL = 10_000_000;
function scrollable(tab: ScrollTab): boolean {
  return tab === "editor" || tab === "settings";
}
function validTop(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= 0 && value <= MAX_SCROLL;
}
export function readFoldScrollTop(tab: ScrollTab): number | null {
  if (!scrollable(tab)) return null;
  try {
    const raw = localStorage.getItem(KEY + tab);
    if (!raw || raw.length > 18 || !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(raw))
      return null;
    const top = Number(raw);
    return validTop(top) ? top : null;
  } catch { return null; }
}
export function saveFoldScrollTop(tab: ScrollTab, top: number): boolean {
  if (!scrollable(tab) || !validTop(top)) return false;
  try {
    localStorage.setItem(KEY + tab, String(Math.round(top * 1000) / 1000));
    return true;
  } catch { return false; }
}

/** Keeping the desired position until delayed editor content is available
 * avoids persisting a spurious scrollTop=0 during the empty loading state.
 */
export class FoldScrollRestorer {
  private tab: ScrollTab | null = null;
  private desired: number | null = null;
  private entered = false;
  private programmaticTop: number | null = null;

  activate(tab: ScrollTab, port: ScrollPort): void {
    if (this.tab === tab) return;
    // The old tab is explicitly captured before state changes. At this point
    // React may already have rendered the new tab into the same scroll port.
    this.tab = tab;
    this.desired = readFoldScrollTop(tab);
    this.entered = false;
    this.programmaticTop = 0;
    port.scrollTop = 0;
  }

  enter(tab: ScrollTab, port: ScrollPort): void {
    if (tab !== this.tab) return;
    this.entered = true;
    this.retry(tab, port);
  }

  retry(tab: ScrollTab, port: ScrollPort): void {
    if (tab !== this.tab || !this.entered || this.desired === null) return;
    const extent = Math.max(0, port.scrollHeight - port.clientHeight);
    if (!Number.isFinite(extent)) return;
    const top = Math.min(extent, this.desired);
    this.programmaticTop = top;
    port.scrollTop = top;
    // Do not persist a clamped temporary value when the editor still loads.
    if (extent >= this.desired) this.desired = null;
  }

  onScroll(tab: ScrollTab, port: ScrollPort): void {
    if (tab !== this.tab || !this.entered || !scrollable(tab)) return;
    if (this.programmaticTop !== null &&
        Math.abs(port.scrollTop - this.programmaticTop) < 1) {
      this.programmaticTop = null;
      return;
    }
    this.programmaticTop = null;
    if (!validTop(port.scrollTop)) return;
    // An actual user scroll cancels a pending automatic restoration.
    this.desired = null;
    saveFoldScrollTop(tab, port.scrollTop);
  }

  capture(port: ScrollPort): void {
    if (this.tab && this.entered && this.desired === null &&
        validTop(port.scrollTop)) saveFoldScrollTop(this.tab, port.scrollTop);
  }

  /** Called after saving the old tab, before React renders the replacement.
   * Layout-induced scroll events during the transition are not user input.
   */
  pauseForTransition(): void {
    this.entered = false;
  }

  pending(tab: ScrollTab): boolean {
    return tab === this.tab && this.desired !== null;
  }
}
