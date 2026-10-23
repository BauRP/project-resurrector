import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
export interface FoldFeature {
  leftPx: number; topPx: number; rightPx: number; bottomPx: number;
  orientation: string; state: string; occlusion: string; separating: boolean;
}
export interface DisplayTopology {
  widthPx: number; heightPx: number; widthDp: number; heightDp: number;
  density: number; revision: number; posture: "reported" | "unknown";
  source: string; foldingFeatures: FoldFeature[];
  systemInsetsPx?: { left: number; top: number; right: number; bottom: number };
}
interface NativeBridge {
  getState(): Promise<DisplayTopology>;
  startObserving(): Promise<DisplayTopology>;
  stopObserving(): Promise<void>;
  addListener(eventName: "topologyChanged", listener: (info: DisplayTopology) => void): Promise<PluginListenerHandle>;
}
const NativeDisplay = registerPlugin<NativeBridge>("DisplayTopology");
type Split = "vertical" | "horizontal" | "none";
type Region = { left: number; top: number; width: number; height: number };
export function windowClass(width: number) {
  return width < 600 ? "compact" : width < 840 ? "medium" : width < 1200 ? "expanded" : width < 1600 ? "large" : "extra-large";
}
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
/** Native folding bounds are in physical window pixels; map them to the WebView's actual CSS viewport.
 * Separate only when a feature physically occludes content or reports two logical regions.
 * Ignore unsupported/outside-window hinge geometries instead of inventing a posture.
 */
export function calculateDisplayRegions(topology: DisplayTopology, cssWidth: number, cssHeight: number): { regions: Region[]; split: Split; occluded: boolean; hinges: FoldFeature[] } {
  const sx = cssWidth / Math.max(1, topology.widthPx);
  const sy = cssHeight / Math.max(1, topology.heightPx);
  let regions: Region[] = [{ left: 0, top: 0, width: cssWidth, height: cssHeight }];
  let split: Split = "none";
  let occluded = false;
  const hinges = topology.foldingFeatures.filter(f => f.separating);
  for (const f of hinges) {
    const left = clamp(f.leftPx * sx, 0, cssWidth);
    const right = clamp(f.rightPx * sx, 0, cssWidth);
    const top = clamp(f.topPx * sy, 0, cssHeight);
    const bottom = clamp(f.bottomPx * sy, 0, cssHeight);
    const vertical = f.orientation.toUpperCase().includes("VERTICAL");
    const full = f.occlusion.toUpperCase().includes("FULL");
    // A fold crease without physical occlusion is not a black line.
    const gap = full ? Math.max(0, vertical ? right - left : bottom - top) : 0;
    let next: Region[] = [];
    for (const region of regions) {
      if (vertical && left > region.left + 40 && right < region.left + region.width - 40) {
        const a: Region = { ...region, width: left - region.left };
        const b: Region = { left: left + gap, top: region.top, width: region.left + region.width - (left + gap), height: region.height };
        if (a.width > 0 && b.width > 0) { next.push(a, b); split = "vertical"; occluded ||= full; }
        else next.push(region);
      } else if (!vertical && top > region.top + 40 && bottom < region.top + region.height - 40) {
        const a: Region = { ...region, height: top - region.top };
        const b: Region = { left: region.left, top: top + gap, width: region.width, height: region.top + region.height - (top + gap) };
        if (a.height > 0 && b.height > 0) { next.push(a, b); split = "horizontal"; occluded ||= full; }
        else next.push(region);
      } else next.push(region);
    }
    regions = next;
  }
  return { regions, split, occluded, hinges };
}

export function startDisplayAdaptation(): () => void {
  let disposed = false, lastRevision = -1;
  let listener: PluginListenerHandle | undefined;
  const root = document.documentElement;
  const width = () => window.innerWidth;
  const height = () => window.innerHeight;
  const measure = () => {
    if (disposed) return;
    root.dataset.windowClass = windowClass(width());
    root.dataset.windowHeight = height() < 480 ? "short" : "regular";
    root.style.setProperty("--app-viewport-height", height() + "px");
  };
  const apply = (state: DisplayTopology) => {
    if (disposed || state.revision < lastRevision) return;
    lastRevision = state.revision;
    const geometry = calculateDisplayRegions(state, width(), height());
    root.dataset.foldInfo = state.posture;
    root.dataset.foldCount = String(state.foldingFeatures.length);
    root.dataset.foldSplit = geometry.split;
    root.dataset.separatingFold = String(geometry.hinges.length > 0);
    root.dataset.occludingFold = String(geometry.occluded);
    // Keep all reported hinge bounds: two separate hinges stay two separate features.
    root.dataset.foldRegions = String(geometry.regions.length);
    const panes = geometry.regions.sort((a,b) => a.left - b.left || a.top - b.top);
    // CSS pane-aware camera placement is only used when BOTH useful panes exist.
    const eligible = panes.length >= 2 && panes[0]!.width >= 260 && panes[1]!.width >= 230 &&
      panes[0]!.height >= 260 && geometry.split === "vertical";
    root.dataset.cameraSplit = eligible ? "side" : "none";
    const leftPane = panes[0], rightPane = panes[1];
    root.style.setProperty("--camera-left-pane-width", (leftPane?.width ?? width()) + "px");
    root.style.setProperty("--camera-right-pane-left", (rightPane?.left ?? width()) + "px");
    const horizontal = geometry.split === "horizontal" && panes.length >= 2 &&
      panes[0]!.height >= 170 && panes[1]!.height >= 170;
    root.dataset.cameraTabletop = horizontal ? "true" : "false";
    if (horizontal) {
      root.style.setProperty("--camera-upper-height", panes[0]!.height + "px");
      root.style.setProperty("--camera-lower-top", panes[1]!.top + "px");
    }
    measure();
  };
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", measure);
  window.visualViewport?.addEventListener("resize", measure);
  measure();
  if (Capacitor.isNativePlatform()) {
    void NativeDisplay.addListener("topologyChanged", apply).then(handle => {
      if (disposed) { void handle.remove(); return; }
      listener = handle;
      void NativeDisplay.startObserving().then(apply).catch(() => { root.dataset.foldInfo = "unknown"; });
    }).catch(() => { root.dataset.foldInfo = "unknown"; });
  }
  return () => {
    disposed = true;
    window.removeEventListener("resize", measure);
    window.removeEventListener("orientationchange", measure);
    window.visualViewport?.removeEventListener("resize", measure);
    void listener?.remove();
    if (Capacitor.isNativePlatform()) void NativeDisplay.stopObserving().catch(() => {});
    ["foldInfo","foldCount","foldSplit","separatingFold","occludingFold","foldRegions","cameraSplit","cameraTabletop","windowClass","windowHeight"].forEach(key => { delete root.dataset[key]; });
    ["--app-viewport-height","--camera-left-pane-width","--camera-right-pane-left","--camera-upper-height","--camera-lower-top"].forEach(key => root.style.removeProperty(key));
  };
}
