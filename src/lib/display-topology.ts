import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface FoldFeature {
  leftPx: number; topPx: number; rightPx: number; bottomPx: number;
  orientation: string; state: string; occlusion: string; separating: boolean;
}
export interface DisplayTopology {
  widthPx: number; heightPx: number; widthDp: number; heightDp: number;
  density: number; revision: number; posture: "reported" | "unknown";
  source: string; foldingFeatures: FoldFeature[];
}
interface DisplayTopologyNative {
  getState(): Promise<DisplayTopology>;
  startObserving(): Promise<DisplayTopology>;
  stopObserving(): Promise<void>;
  addListener(eventName: "topologyChanged", listener: (topology: DisplayTopology) => void): Promise<PluginListenerHandle>;
}
const NativeDisplay = registerPlugin<DisplayTopologyNative>("DisplayTopology");
const sizeClass = (width: number) => width < 600 ? "compact" : width < 840 ? "medium" : width < 1200 ? "expanded" : width < 1600 ? "large" : "extra-large";

/**
 * Observes the *actual application window*, including all conventional phones,
 * tablets, multi-window, outer covers and opened folding displays.
 * A genuine fold state is only reported when Android exposes FoldingFeature.
 * No layout action touches camera ownership, streams, or recording state.
 */
export function startDisplayAdaptation(): () => void {
  let disposed = false;
  let listener: PluginListenerHandle | undefined;
  let lastRevision = -1;
  const root = document.documentElement;
  const getWidth = () => document.querySelector(".app-shell")?.getBoundingClientRect().width || window.innerWidth;
  const measure = () => {
    if (disposed) return;
    const width = getWidth();
    const height = window.visualViewport?.height ?? window.innerHeight;
    // CSS pixels are the correct web-layout coordinate system; do not treat them as physical pixels.
    root.dataset.windowClass = sizeClass(width);
    root.dataset.windowHeight = height < 480 ? "short" : "regular";
    root.style.setProperty("--app-viewport-height", `${height}px`);
  };
  const applyNative = (state: DisplayTopology) => {
    if (disposed || state.revision < lastRevision) return;
    lastRevision = state.revision;
    root.dataset.foldInfo = state.posture;
    root.dataset.foldCount = String(state.foldingFeatures.length);
    root.dataset.separatingFold = String(state.foldingFeatures.some((f) => f.separating));
    const occluding = state.foldingFeatures.filter((feature) => feature.separating && feature.occlusion.toUpperCase().includes("FULL"));
    // Fold bounds are Android-window coordinates; convert through device density to CSS pixels.
    // A harmless visual crease is not treated as a physical missing-pixel gap.
    const gap = occluding.reduce((max, feature) => Math.max(max, feature.orientation.toUpperCase().includes("VERTICAL") ? (feature.rightPx - feature.leftPx) / (state.density || 1) : 0), 0);
    root.style.setProperty("--fold-occlusion-width", `${Math.min(Math.max(gap, 0), 160)}px`);
    // The system may expose zero or one fold even on an opened tri-fold device.
    // Do not manufacture missing hinges or classify a cover screen by its resolution.
    measure();
  };
  const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : undefined;
  const shell = document.querySelector(".app-shell");
  if (shell) resizeObserver?.observe(shell);
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", measure);
  window.visualViewport?.addEventListener("resize", measure);
  measure();

  if (Capacitor.isNativePlatform()) {
    void NativeDisplay.addListener("topologyChanged", applyNative).then((handle) => {
      if (disposed) void handle.remove(); else listener = handle;
      if (!disposed) void NativeDisplay.startObserving().then(applyNative).catch(() => {
        root.dataset.foldInfo = "unknown";
      });
    }).catch(() => { root.dataset.foldInfo = "unknown"; });
  }
  return () => {
    disposed = true;
    resizeObserver?.disconnect();
    window.removeEventListener("resize", measure);
    window.removeEventListener("orientationchange", measure);
    window.visualViewport?.removeEventListener("resize", measure);
    void listener?.remove();
    if (Capacitor.isNativePlatform()) void NativeDisplay.stopObserving().catch(() => undefined);
    delete root.dataset.foldCount;
    delete root.dataset.foldInfo;
    delete root.dataset.separatingFold;
    delete root.dataset.windowClass;
    delete root.dataset.windowHeight;
    root.style.removeProperty("--app-viewport-height");
    root.style.removeProperty("--fold-occlusion-width");
  };
}
