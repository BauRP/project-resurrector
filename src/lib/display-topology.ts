import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { FOLD_EVENT } from "./fold-recording-evidence";
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
  if (!Number.isFinite(cssWidth) || !Number.isFinite(cssHeight) ||
      cssWidth <= 0 || cssHeight <= 0 || !Number.isFinite(topology.widthPx) ||
      !Number.isFinite(topology.heightPx) || topology.widthPx <= 0 ||
      topology.heightPx <= 0 || !Array.isArray(topology.foldingFeatures)) {
    return { regions: [], split: "none", occluded: false, hinges: [] };
  }
  const sx = cssWidth / topology.widthPx;
  const sy = cssHeight / Math.max(1, topology.heightPx);
  let regions: Region[] = [{ left: 0, top: 0, width: cssWidth, height: cssHeight }];
  let split: Split = "none";
  let occluded = false;
  const hinges = topology.foldingFeatures.filter(f => f && typeof f === "object" && f.separating &&
    typeof f.orientation === "string" &&
    (f.orientation.toUpperCase().includes("VERTICAL") || f.orientation.toUpperCase().includes("HORIZONTAL")) &&
    typeof f.occlusion === "string" &&
    [f.leftPx, f.rightPx, f.topPx, f.bottomPx].every(Number.isFinite) &&
    f.rightPx >= f.leftPx && f.bottomPx >= f.topPx &&
    f.leftPx <= topology.widthPx && f.topPx <= topology.heightPx &&
    f.rightPx >= 0 && f.bottomPx >= 0);
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
      // A hinge segment only divides a pane if it traverses substantially
      // the *entire* pane on the perpendicular axis. Short decorations,
      // camera cutouts and out-of-window feature bounds never create panes.
      const coversHeight = Math.max(0, Math.min(bottom, region.top + region.height) -
        Math.max(top, region.top)) >= region.height * 0.85;
      const coversWidth = Math.max(0, Math.min(right, region.left + region.width) -
        Math.max(left, region.left)) >= region.width * 0.85;
      if (vertical && coversHeight && left > region.left + 40 && right < region.left + region.width - 40) {
        const a: Region = { ...region, width: left - region.left };
        const b: Region = { left: left + gap, top: region.top, width: region.left + region.width - (left + gap), height: region.height };
        if (a.width > 0 && b.width > 0) { next.push(a, b); split = "vertical"; occluded ||= full; }
        else next.push(region);
      } else if (!vertical && coversWidth && top > region.top + 40 && bottom < region.top + region.height - 40) {
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
  let lastNative: DisplayTopology | null = null;
  let refreshFrame = 0;
  const root = document.documentElement;
  const width = () => window.innerWidth;
  const height = () => window.innerHeight;
  const measure = () => {
    if (disposed) return;
    root.dataset.windowClass = windowClass(width());
    root.dataset.windowHeight = height() < 480 ? "short" : "regular";
    root.style.setProperty("--app-viewport-height", height() + "px");
    // Native folding bounds are stable in their own coordinate system, but
    // the CSS viewport and camera region can change independently.
    if (lastNative) layout(lastNative);
  };
  const layout = (state: DisplayTopology) => {
    if (disposed) return;
    const geometry = calculateDisplayRegions(state, width(), height());
    if (!geometry.regions.length) return;
    root.dataset.foldInfo = state.posture;
    root.dataset.foldCount = String(state.foldingFeatures.length);
    root.dataset.foldSplit = geometry.split;
    root.dataset.separatingFold = String(geometry.hinges.length > 0);
    root.dataset.occludingFold = String(geometry.occluded);
    // Keep all reported hinge bounds: two separate hinges stay two separate features.
    root.dataset.foldRegions = String(geometry.regions.length);
    // Keep non-camera working surfaces fully inside an available pane if a real
    // hinge cuts across the app window. Unlike camera this region is chosen
    // by usable size rather than a hard-coded left/right position.
    const shell = document.querySelector(".app-shell")?.getBoundingClientRect();
    const shellLeft = shell?.left ?? 0;
    const shellWidth = shell?.width ?? width();
    const workspace = [...geometry.regions].map(region => {
      const left = Math.max(0, region.left - shellLeft);
      const right = Math.min(shellWidth, region.left + region.width - shellLeft);
      return { ...region, left, width: Math.max(0, right - left) };
    }).sort((a,b)=> b.width*b.height-a.width*a.height)[0];
    const safeWorkspace = geometry.regions.length > 1 && !!workspace && workspace.width >= 300 && workspace.height >= 220;
    root.dataset.foldWorkspace = safeWorkspace ? "pane" : "normal";
    root.style.setProperty("--fold-work-left", (workspace?.left ?? 0) + "px");
    root.style.setProperty("--fold-work-width", (workspace?.width ?? shellWidth) + "px");
    const panes = [...geometry.regions].sort((a,b) => a.left - b.left || a.top - b.top);
    // CSS pane-aware camera placement is only used when BOTH useful panes exist.
    const eligible = panes.length >= 2 && panes[0]!.width >= 260 && panes[1]!.width >= 230 &&
      panes[0]!.height >= 260 && geometry.split === "vertical";
    const thirdPane = panes[2];
    const eligibleThree = eligible && !!thirdPane && thirdPane.width >= 230 &&
      thirdPane.height >= 260 && panes[1]!.height >= 260;
    // In a verified three-region window: primary viewfinder | HUD/tools |
    // record controls. Never synthesize a third region from device branding.
    root.dataset.cameraSplit = eligibleThree ? "tri" : eligible ? "side" : "none";
    const leftPane = panes[0], rightPane = panes[1];
    const controlPane = eligibleThree ? thirdPane : rightPane;
    const cameraRect = document.querySelector(".camera-screen")?.getBoundingClientRect();
    const cameraLeft = cameraRect?.left ?? 0;
    const cameraTop = cameraRect?.top ?? 0;
    root.style.setProperty("--camera-left-pane-width", Math.max(0, (leftPane?.left ?? 0) + (leftPane?.width ?? width()) - cameraLeft) + "px");
    root.style.setProperty("--camera-right-pane-left", Math.max(0, (rightPane?.left ?? width()) - cameraLeft) + "px");
    root.style.setProperty("--camera-right-pane-width", Math.max(0, rightPane?.width ?? 0) + "px");
    root.style.setProperty("--camera-control-pane-left", Math.max(0, (controlPane?.left ?? width()) - cameraLeft) + "px");
    root.style.setProperty("--camera-control-pane-width", Math.max(0, controlPane?.width ?? 0) + "px");
    const horizontal = geometry.split === "horizontal" && panes.length >= 2 &&
      panes[0]!.height >= 170 && panes[1]!.height >= 170;
    root.dataset.cameraTabletop = horizontal ? "true" : "false";
    if (horizontal) {
      root.style.setProperty("--camera-upper-height", Math.max(0, panes[0]!.top + panes[0]!.height - cameraTop) + "px");
      root.style.setProperty("--camera-lower-top", Math.max(0, panes[1]!.top - cameraTop) + "px");
    }
  };
  const apply = (state: DisplayTopology) => {
    if (disposed || state.revision < lastRevision ||
      !Number.isFinite(state.widthPx) || !Number.isFinite(state.heightPx) ||
      state.widthPx <= 0 || state.heightPx <= 0 || !Array.isArray(state.foldingFeatures)) return;
    lastRevision = state.revision;
    lastNative = state;
    window.dispatchEvent(new CustomEvent(FOLD_EVENT, { detail: {
      revision: state.revision,
      posture: state.foldingFeatures.map(f => f.state).join(",") || state.posture,
      hingeCount: state.foldingFeatures.length,
      usableRegions: calculateDisplayRegions(state, width(), height()).regions.length,
      layout: calculateDisplayRegions(state, width(), height()).split,
    } }));
    layout(state);
    measure();
  };
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", measure);
  window.visualViewport?.addEventListener("resize", measure);
  const content = document.querySelector(".app-scroll");
  const scheduleMeasure = () => {
    if (refreshFrame) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(measure);
  };
  const geometryObserver = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(scheduleMeasure) : null;
  const shell = document.querySelector(".app-shell");
  if (shell) geometryObserver?.observe(shell);
  const camera = document.querySelector(".camera-screen");
  if (camera) geometryObserver?.observe(camera);
  const mutations = content && typeof MutationObserver !== "undefined" ? new MutationObserver(() => {
    // React replaces the camera/editor/settings inside an animated child.
    // Track nested mounts and recalculate pane offsets without touching streams.
    const nextCamera = document.querySelector(".camera-screen");
    if (nextCamera) geometryObserver?.observe(nextCamera);
    scheduleMeasure();
  }) : null;
  if (content) mutations?.observe(content, { childList: true, subtree: true });
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
    mutations?.disconnect();
    geometryObserver?.disconnect();
    cancelAnimationFrame(refreshFrame);
    void listener?.remove();
    if (Capacitor.isNativePlatform()) void NativeDisplay.stopObserving().catch(() => {});
    ["foldInfo","foldCount","foldSplit","separatingFold","occludingFold","foldRegions","foldWorkspace","cameraSplit","cameraTabletop","windowClass","windowHeight"].forEach(key => { delete root.dataset[key]; });
    ["--app-viewport-height","--fold-work-left","--fold-work-width","--camera-left-pane-width","--camera-right-pane-left","--camera-right-pane-width","--camera-control-pane-left","--camera-control-pane-width","--camera-upper-height","--camera-lower-top"].forEach(key => root.style.removeProperty(key));
  };
}
