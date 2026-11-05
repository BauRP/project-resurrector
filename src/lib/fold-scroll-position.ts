/** Keeps the app's VERTICAL scroll separately for Editor and Settings across
 * tab changes, orientation changes and Android Activity/WebView recreation.
 * Camera is always allowed to start at the top and never persists scroll.
 * This intentionally stores only numbers, not media or camera identities.
 */
import { scheduleAfterPaintTask } from "./after-paint-task";

export type ScrollTab = "camera" | "editor" | "settings";
export interface ScrollPort {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}
const KEY = "multicam-fold-scroll-v1:";
const MAX_SCROLL = 10_000_000;
// Queue only the newest scroll position for each tab. localStorage writes are
// synchronous on Android WebView; never perform them inside a tab click or
// scroll handler. pagehide flushes pending values for Activity recreation.
const deferredScroll = new Map<ScrollTab, number>();
let cancelScrollFlush: (() => void) | null = null;
function deferFoldScrollTop(tab: ScrollTab, top: number): boolean {
  if (!scrollable(tab) || !validTop(top)) return false;
  deferredScroll.set(tab, top);
  if (cancelScrollFlush === null) {
    // Pending scroll is already readable from the in-memory map.
    // Avoid writing LevelDB during the incoming tab's first paint.
    cancelScrollFlush = scheduleAfterPaintTask(flushFoldScrollWrites);
  }
  return true;
}
export function flushFoldScrollWrites(): void {
  cancelScrollFlush?.();
  cancelScrollFlush = null;
  const entries = [...deferredScroll.entries()];
  deferredScroll.clear();
  for (const [tab, top] of entries) saveFoldScrollTop(tab, top);
}
function scrollable(tab: ScrollTab): boolean {
  return tab === "editor" || tab === "settings";
}
function validTop(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= 0 && value <= MAX_SCROLL;
}
export function readFoldScrollTop(tab: ScrollTab): number | null {
  if (!scrollable(tab)) return null;
  const staged = deferredScroll.get(tab);
  if (staged !== undefined) return staged;
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
  // Direct callers intentionally request immediate persistence; it supersedes
  // any earlier debounced write for this tab.
  deferredScroll.delete(tab);
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
  private lastStableTop: number | null = null;
  private lastContentHeight: number | null = null;
  private lastSaveAt = -Infinity;
  private savedTop: number | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private persistLatest(): void {
    if (this.saveTimer !== null) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    if (!this.tab || !scrollable(this.tab) || this.lastStableTop === null ||
        this.desired !== null || this.savedTop === this.lastStableTop) return;
    if (deferFoldScrollTop(this.tab, this.lastStableTop)) {
      this.savedTop = this.lastStableTop;
      this.lastSaveAt = performance.now();
    }
  }

  activate(tab: ScrollTab, port: ScrollPort): void {
    if (this.tab === tab) return;
    this.persistLatest();
    this.lastSaveAt = -Infinity;
    this.savedTop = null;
    // The old tab is explicitly captured before state changes. At this point
    // React may already have rendered the new tab into the same scroll port.
    this.tab = tab;
    this.desired = readFoldScrollTop(tab);
    this.lastStableTop = this.desired;
    this.lastContentHeight = port.scrollHeight;
    this.entered = false;
    this.programmaticTop = 0;
    if (Math.abs(port.scrollTop) >= 1) port.scrollTop = 0;
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
    if (Math.abs(port.scrollTop - top) >= 1) port.scrollTop = top;
    // Do not persist a clamped temporary value when the editor still loads.
    if (extent >= this.desired) {
      this.lastStableTop = this.desired;
      this.desired = null;
    }
    this.lastContentHeight = port.scrollHeight;
  }

  /** A fold can shrink the document before React has finished remounting the
   * editor; keep the previous content position until its height returns.
   */
  onViewportReflow(tab: ScrollTab, port: ScrollPort): void {
    if (tab !== this.tab || !this.entered || !scrollable(tab)) return;
    if (this.desired === null && this.lastStableTop !== null &&
        this.lastContentHeight !== null &&
        port.scrollHeight + 2 < this.lastContentHeight &&
        port.scrollTop + 2 < this.lastStableTop) {
      this.desired = this.lastStableTop;
    }
    this.retry(tab, port);
    this.lastContentHeight = port.scrollHeight;
  }

  onScroll(tab: ScrollTab, port: ScrollPort): void {
    if (tab !== this.tab || !this.entered || !scrollable(tab)) return;
    if (this.desired === null && this.lastStableTop !== null &&
        this.lastContentHeight !== null &&
        port.scrollHeight + 2 < this.lastContentHeight &&
        port.scrollTop + 2 < this.lastStableTop) {
      this.desired = this.lastStableTop;
      this.retry(tab, port);
      return;
    }
    if (this.programmaticTop !== null &&
        Math.abs(port.scrollTop - this.programmaticTop) < 1) {
      this.programmaticTop = null;
      return;
    }
    this.programmaticTop = null;
    if (!validTop(port.scrollTop)) return;
    // An actual user scroll cancels a pending automatic restoration.
    this.desired = null;
    this.lastStableTop = port.scrollTop;
    this.lastContentHeight = port.scrollHeight;
    // The first gesture is saved immediately, subsequent rapid scroll
    // events are coalesced. Pagehide/tab changes synchronously flush the
    // latest exact position so no user scroll is lost.
    if (performance.now() - this.lastSaveAt >= 240) this.persistLatest();
    else if (this.saveTimer === null) {
      this.saveTimer = setTimeout(() => this.persistLatest(),
        Math.max(1, 240 - (performance.now() - this.lastSaveAt)));
    }
  }

  capture(port: ScrollPort): void {
    if (this.tab && this.entered && this.desired === null &&
        validTop(port.scrollTop)) {
      this.lastStableTop = port.scrollTop;
      this.persistLatest();
    }
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
