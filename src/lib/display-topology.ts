import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import { FOLD_EVENT, rememberActiveFoldSnapshot, forgetActiveFoldSnapshot } from "./fold-recording-evidence";
export interface FoldFeature {
  leftPx: number; topPx: number; rightPx: number; bottomPx: number;
  orientation: string; state: string; occlusion: string; separating: boolean;
}
export interface DisplayTopology {
  widthPx: number; heightPx: number; widthDp: number; heightDp: number;
  density: number; revision: number; posture: "reported" | "unknown";
  source: string; foldingFeatures: FoldFeature[];
  systemInsetsPx?: { left: number; top: number; right: number; bottom: number };
  /** Measured WebView rectangle in DecorView-relative WINDOW px. Hinges
   * use the same coordinate system. Not dp or CSS pixels. */
  webViewBoundsPx?: { left: number; top: number; right: number; bottom: number };
}
interface NativeBridge {
  getState(): Promise<DisplayTopology>;
  startObserving(options: { ownerId: string }): Promise<DisplayTopology>;
  stopObserving(options: { ownerId: string }): Promise<void>;
  addListener(eventName: "topologyChanged", listener: (info: DisplayTopology) => void): Promise<PluginListenerHandle>;
}
const NativeDisplay = registerPlugin<NativeBridge>("DisplayTopology");
// DOM fold layout properties belong to the newest mounted adaptation only.
// Old React teardown must not clear a newer screen's measured pane styles.
let activeAdaptation: symbol | null = null;
type Split = "vertical" | "horizontal" | "none";
type Region = { left: number; top: number; width: number; height: number };
/** Ignore transient zero, negative and non-finite WebView dimensions.
 * In particular never feed "NaNpx" into the CSS layout after a fold.
 */
export function safeViewportDimension(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}
/** Keep invalid transient CSS viewport readings from clearing a valid
 * fold layout while Android resizes an Activity.
 */
export function retainedViewportDimension(incoming: number, previous: number | null): number | null {
  return safeViewportDimension(incoming) ?? previous;
}
export function windowClass(width: number) {
  // Do not advertise a huge foldable layout for a temporarily invalid width.
  if (!Number.isFinite(width) || width <= 0) return "compact";
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
  // WindowManager reports folding bounds in WINDOW pixels; the browser's
  // CSS origin is instead the top-left of the embedded WebView. The latter
  // can be inset from the DecorView on cover displays or in multi-window.
  // Treat an explicitly corrupted WebView rectangle as unknown geometry,
  // not as permission to place controls over a guessed physical hinge.
  const fullWindow = {left:0,top:0,right:topology.widthPx,bottom:topology.heightPx};
  const reported = topology.webViewBoundsPx;
  const validWebView = !reported || (
    [reported.left,reported.top,reported.right,reported.bottom].every(Number.isFinite) &&
    reported.left >= 0 && reported.top >= 0 &&
    reported.right <= topology.widthPx && reported.bottom <= topology.heightPx &&
    reported.right > reported.left && reported.bottom > reported.top
  );
  if (!validWebView)
    return {regions:[{left:0,top:0,width:cssWidth,height:cssHeight}],
      split:"none",occluded:false,hinges:[]};
  const viewport = reported ?? fullWindow;
  const sx = cssWidth / (viewport.right - viewport.left);
  const sy = cssHeight / (viewport.bottom - viewport.top);
  // Refuse malformed native values that would produce infinite CSS positions.
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0)
    return { regions: [{left:0,top:0,width:cssWidth,height:cssHeight}], split:"none", occluded:false, hinges:[] };
  let regions: Region[] = [{ left: 0, top: 0, width: cssWidth, height: cssHeight }];
  let split: Split = "none";
  let occluded = false;
  const usedHinges: FoldFeature[] = [];
  const hinges = topology.foldingFeatures.filter(f => f && typeof f === "object" && f.separating &&
    typeof f.orientation === "string" &&
    (f.orientation.toUpperCase().includes("VERTICAL") || f.orientation.toUpperCase().includes("HORIZONTAL")) &&
    typeof f.occlusion === "string" &&
    [f.leftPx, f.rightPx, f.topPx, f.bottomPx].every(Number.isFinite) &&
    f.rightPx >= f.leftPx && f.bottomPx >= f.topPx &&
    f.leftPx >= 0 && f.topPx >= 0 &&
    f.rightPx <= topology.widthPx && f.bottomPx <= topology.heightPx);
  // Processing order is NOT a physical posture: OEMs may enumerate the
  // exact same perpendicular folds in either order on consecutive callbacks.
  // Canonical geometry prevents fake transitions and unstable pane indices.
  hinges.sort((a, b) =>
    Number(!a.orientation.toUpperCase().includes("VERTICAL")) -
      Number(!b.orientation.toUpperCase().includes("VERTICAL")) ||
    a.leftPx - b.leftPx || a.topPx - b.topPx ||
    a.rightPx - b.rightPx || a.bottomPx - b.bottomPx);
  for (const f of hinges) {
    // Clip a *reported* physical fold to the portion actually occupied by
    // WebView; do not assume it starts at Android window coordinate (0,0).
    // Clamping also handles a full-width hinge partly outside a split window.
    const left = clamp((f.leftPx - viewport.left) * sx, 0, cssWidth);
    const right = clamp((f.rightPx - viewport.left) * sx, 0, cssWidth);
    const top = clamp((f.topPx - viewport.top) * sy, 0, cssHeight);
    const bottom = clamp((f.bottomPx - viewport.top) * sy, 0, cssHeight);
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
    if (next.length > regions.length) usedHinges.push(f);
    regions = next;
  }
  // Report only features that actually split usable regions.
  // A short/non-crossing hinge cannot be claimed as an active camera pane gap.
  return { regions, split, occluded, hinges: usedHinges };
}


/** Passive geometry evidence; a resize never proves uninterrupted recording. */
export function foldEventDetails(state: DisplayTopology, cssWidth: number, cssHeight: number) {
  const geometry = calculateDisplayRegions(state, cssWidth, cssHeight);
  return {
    revision: state.revision,
    // WindowManager may report identical physical hinges in a different
    // array order. A reordered callback is not a new physical posture.
    posture: [...geometry.hinges]
      .sort((a,b) => a.leftPx - b.leftPx || a.topPx - b.topPx ||
        a.rightPx - b.rightPx || a.bottomPx - b.bottomPx)
      .map(f => f.state).filter(x => typeof x === "string").join(",") || state.posture,
    hingeCount: geometry.hinges.length,
    usableRegions: geometry.regions.length,
    layout: geometry.split,
    // Native revisions may not change when only the WebView viewport changes.
    // WindowManager may reorder two physical hinges between callbacks.
    // Sort measured pane coordinates to avoid fictitious fold events.
    regionGeometry: [...geometry.regions].sort((a,b)=>a.left-b.left || a.top-b.top)
      .map(r => [r.left,r.top,r.width,r.height]
        .map(n => Math.round(n)).join(",")).join(";"),
  };
}

/** Intersect an actual pane with the camera container (below its persistent
 * header). Blindly clamping a negative top coordinate to zero would extend
 * the preview across an occluding horizontal hinge.
 */
export function clipFoldPaneToCamera(
  pane: Region, camera: Region,
): Region | null {
  if (![pane.left,pane.top,pane.width,pane.height,
         camera.left,camera.top,camera.width,camera.height].every(Number.isFinite) ||
      pane.width<=0 || pane.height<=0 || camera.width<=0 || camera.height<=0)
    return null;
  const left=Math.max(pane.left,camera.left), top=Math.max(pane.top,camera.top);
  const right=Math.min(pane.left+pane.width,camera.left+camera.width);
  const bottom=Math.min(pane.top+pane.height,camera.top+camera.height);
  return right>left&&bottom>top?{left,top,width:right-left,height:bottom-top}:null;
}

/** Restrict editor/settings to the *intersection* of reported WindowManager
 * panes and the currently visible content viewport, on BOTH axes.
 * Otherwise a lower tabletop pane can be selected by area while its UI still
 * crosses the physical horizontal hinge.
 */
export function selectSafeFoldWorkspace(
  regions:Region[], contentBounds:Region,
  minWidth=300,minHeight=220,
):Region|null {
  if(regions.length<2)return null;
  const usable=regions.map(region=>clipFoldPaneToCamera(region,contentBounds))
    .filter((region):region is Region=>region!==null &&
      region.width>=minWidth && region.height>=minHeight);
  usable.sort((a,b)=>b.width*b.height-a.width*a.height||a.top-b.top||a.left-b.left);
  return usable[0]??null;
}

/** Constrain editor/settings to the portion visible above the Android
 * software keyboard. VisualViewport may be offset during zoom/keyboard
 * transitions; do not treat its height alone as a screen-origin rectangle.
 * Camera2 and the underlying physical hinge mapping remain unchanged.
 */
export function foldVisibleContentBounds(
  shell:Region, content:Region, headerBottom:number,
  visual:{offsetTop:number;height:number}|null|undefined,
):Region {
  const safeVisual=!!visual && Number.isFinite(visual.offsetTop) &&
    Number.isFinite(visual.height) && visual.height>0;
  const top=Math.max(content.top,Number.isFinite(headerBottom)?headerBottom:content.top,
    safeVisual?visual!.offsetTop:content.top);
  const bottom=Math.min(content.top+content.height,
    safeVisual?visual!.offsetTop+visual!.height:content.top+content.height);
  const left=Math.max(shell.left,content.left);
  const right=Math.min(shell.left+shell.width,content.left+content.width);
  return {left,top,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
}

/** True four-pane camera workstation only with four actual usable regions
 * forming a 2x2 grid. No synthetic sections or device-name heuristics.
 */
export function fourPaneCameraLayout(regions: Region[]): {
  preview: Region; hud: Region; settings: Region; controls: Region;
} | null {
  if(regions.length!==4 || regions.some(r=>![r.left,r.top,r.width,r.height]
    .every(Number.isFinite) || r.width<220 || r.height<170))return null;
  const byRow=[...regions].sort((a,b)=>a.top-b.top||a.left-b.left);
  const [topLeft,topRight,bottomLeft,bottomRight]=byRow;
  if(!topLeft||!topRight||!bottomLeft||!bottomRight)return null;
  const near=(x:number,y:number)=>Math.abs(x-y)<4;
  const ordered=topLeft.left<topRight.left && bottomLeft.left<bottomRight.left &&
    topLeft.top<bottomLeft.top && topRight.top<bottomRight.top;
  if(!ordered ||
     !near(topLeft.top,topRight.top) ||
     !near(bottomLeft.top,bottomRight.top) ||
     !near(topLeft.left,bottomLeft.left) ||
     !near(topRight.left,bottomRight.left) ||
     !near(topLeft.width,bottomLeft.width) ||
     !near(topRight.width,bottomRight.width) ||
     topLeft.top+topLeft.height>bottomLeft.top+4 ||
     topRight.top+topRight.height>bottomRight.top+4) return null;
  return {preview:topLeft,hud:topRight,settings:bottomLeft,controls:bottomRight};
}

/** Emits when something OBSERVABLE changed or a newer native revision must
 * advance the recording journal's chronology watermark. Purely repeating the
 * same revision and pane layout is not a new event.
 */
export function shouldPublishFoldObservation(
  previousSignature: string, previousRevision: number,
  nextSignature: string, nextRevision: number,
): boolean {
  return nextSignature !== previousSignature || nextRevision > previousRevision;
}

export function startDisplayAdaptation(): () => void {
  const token = Symbol("display-adaptation");
  activeAdaptation = token;
  let disposed = false, lastRevision = -1;
  // Independent native leases prevent a slow old tab cleanup from stopping
  // the new tab's WindowManager observer.
  const ownerId = "fold-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
  let lastFoldSignature = "";
  let lastFoldRevision = -1;
  let listener: PluginListenerHandle | undefined;
  let lastNative: DisplayTopology | null = null;
  let refreshFrame = 0;
  let workspaceTarget:Element|null=null;
  let workspaceYOffset=0;
  const root = document.documentElement;
  const width = () => window.innerWidth;
  const height = () => window.innerHeight;
  let lastGoodWidth: number | null = null;
  let lastGoodHeight: number | null = null;
  const measure = () => {
    if (disposed || activeAdaptation !== token) return;
    const currentWidth = retainedViewportDimension(width(), lastGoodWidth);
    const currentHeight = retainedViewportDimension(height(), lastGoodHeight);
    if (currentWidth === null || currentHeight === null) return;
    lastGoodWidth = currentWidth; lastGoodHeight = currentHeight;
    root.dataset["windowClass"] = windowClass(currentWidth);
    root.dataset["windowHeight"] = currentHeight < 480 ? "short" : "regular";
    root.style.setProperty("--app-viewport-height", currentHeight + "px");
    // Native folding bounds are stable in their own coordinate system, but
    // the CSS viewport and camera region can change independently.
    // Avoid repeatedly publishing identical pane geometry on mutation storms.
    // Actual viewport changes still re-evaluate the latest Android topology.
    if (lastNative && safeViewportDimension(width()) !== null && safeViewportDimension(height()) !== null)
      layout(lastNative);
  };
  const layout = (state: DisplayTopology) => {
    if (disposed || activeAdaptation !== token) return;
    const geometry = calculateDisplayRegions(state, width(), height());
    if (!geometry.regions.length) return;
    // A viewport resize can change the usable panes without a fresh native
    // WindowManager revision. Persist real observed transitions during capture.
    const details = foldEventDetails(state, width(), height());
    // Camera sessions outlive layout changes. Only observed geometry is logged;
    // do not restart or reopen Android capture on a fold transition.
    rememberActiveFoldSnapshot(token, details, Date.now());
    const signature = [details.posture, details.hingeCount, details.usableRegions,
      details.layout, details.regionGeometry].join("|");
    // Native revision alone is not a physical transition; the capture journal
    // records visible postures/regions, not OEM bookkeeping callbacks.
    if (shouldPublishFoldObservation(lastFoldSignature, lastFoldRevision, signature, state.revision)) {
      lastFoldSignature = signature;
      lastFoldRevision = Math.max(lastFoldRevision, state.revision);
      // appendFoldTransition deduplicates unchanged physical geometry while
      // advancing the revision watermark to reject later stale native events.
      window.dispatchEvent(new CustomEvent(FOLD_EVENT, { detail: details }));
    }
    root.dataset["foldInfo"] = state.posture;
    // Never present off-window or malformed reported features as active folds.
    root.dataset["foldCount"] = String(geometry.hinges.length);
    root.dataset["foldSplit"] = geometry.split;
    root.dataset["separatingFold"] = String(geometry.hinges.length > 0);
    root.dataset["occludingFold"] = String(geometry.occluded);
    // Keep all reported hinge bounds: two separate hinges stay two separate features.
    root.dataset["foldRegions"] = String(geometry.regions.length);
    // Keep non-camera working surfaces fully inside an available pane if a real
    // hinge cuts across the app window. Unlike camera this region is chosen
    // by usable size rather than a hard-coded left/right position.
    const shell = document.querySelector(".app-shell")?.getBoundingClientRect();
    const scroll = document.querySelector(".app-scroll")?.getBoundingClientRect();
    const header = document.querySelector(".app-header")?.getBoundingClientRect();
    const shellLeft = Number.isFinite(shell?.left) ? shell!.left : 0;
    const shellWidth = Number.isFinite(shell?.width) && shell!.width>0 ? shell!.width : width();
    const contentBounds=foldVisibleContentBounds(
      {left:shellLeft,top:shell?.top??0,width:shellWidth,height:shell?.height??height()},
      {left:scroll?.left??shellLeft,top:scroll?.top??0,
        width:scroll?.width??shellWidth,height:scroll?.height??height()},
      header?.bottom??0,
      window.visualViewport
        ?{offsetTop:window.visualViewport.offsetTop,height:window.visualViewport.height}
        :null,
    );
    const contentTop=contentBounds.top;
    const workspace = selectSafeFoldWorkspace(geometry.regions,contentBounds);
    root.dataset["foldWorkspace"] = workspace ? "pane" : "normal";
    root.style.setProperty("--fold-work-left",Math.max(0,(workspace?.left??shellLeft)-shellLeft)+"px");
    root.style.setProperty("--fold-work-width",(workspace?.width??shellWidth)+"px");
    root.style.setProperty("--fold-work-height",(workspace?.height??contentBounds.height)+"px");
    const target=document.querySelector(".editor-fold-workspace, .settings-fold-workspace");
    if(target!==workspaceTarget){workspaceTarget=target;workspaceYOffset=0;}
    // position:relative top offsets can be measured without accumulating
    // drift through ResizeObserver or repeated fold callbacks.
    const targetTop=target?.getBoundingClientRect().top??contentTop;
    const unshiftedTop=targetTop-workspaceYOffset;
    workspaceYOffset=target&&workspace
      ?Math.max(0,workspace.top-unshiftedTop):0;
    root.style.setProperty("--fold-work-y-offset",workspaceYOffset+"px");
    const panes = [...geometry.regions].sort((a,b) => a.left - b.left || a.top - b.top);
    // CSS pane-aware camera placement is only used when BOTH useful panes exist.
    // Mixed-orientation multi-hinge layouts need their own pane model; a
    // side-by-side camera cannot be inferred from the last processed hinge.
    const sideBySide = (panes.length === 2 || panes.length === 3) && panes.every((pane, index) =>
      index === 0 || (Math.abs(pane.top - panes[0]!.top) < 4 &&
        Math.abs(pane.height - panes[0]!.height) < 4));
    const eligible = sideBySide && panes[0]!.width >= 260 && panes[1]!.width >= 230 &&
      panes[0]!.height >= 260 && geometry.split === "vertical";
    const thirdPane = panes[2];
    const eligibleThree = eligible && !!thirdPane && thirdPane.width >= 230 &&
      thirdPane.height >= 260 && panes[1]!.height >= 260;
    // In a verified three-region window: primary viewfinder | HUD/tools |
    // record controls. Never synthesize a third region from device branding.
    const leftPane = panes[0], rightPane = panes[1];
    const controlPane = eligibleThree ? thirdPane : rightPane;
    const cameraRect = document.querySelector(".camera-screen")?.getBoundingClientRect();
    const cameraLeft = cameraRect?.left ?? 0;
    const cameraTop = cameraRect?.top ?? 0;
    const cameraBounds: Region = {
      left:cameraLeft,top:cameraTop,
      width:cameraRect?.width??width(),height:cameraRect?.height??height(),
    };
    // Require all four ACTUAL pane intersections to remain usable after
    // excluding the persistent header and other non-camera window regions.
    const clippedQuadRegions=geometry.hinges.length>=2
      ? geometry.regions.map(p=>clipFoldPaneToCamera(p,cameraBounds))
      : [];
    const quad=clippedQuadRegions.length===4 &&
      clippedQuadRegions.every((r):r is Region=>r!==null)
      ?fourPaneCameraLayout(clippedQuadRegions as Region[]):null;
    root.dataset["cameraSplit"] = quad ? "quad" :
      eligibleThree ? "tri" : eligible ? "side" : "none";
    root.style.setProperty("--camera-left-pane-width", Math.max(0, (leftPane?.left ?? 0) + (leftPane?.width ?? width()) - cameraLeft) + "px");
    root.style.setProperty("--camera-right-pane-left", Math.max(0, (rightPane?.left ?? width()) - cameraLeft) + "px");
    root.style.setProperty("--camera-right-pane-width", Math.max(0, rightPane?.width ?? 0) + "px");
    root.style.setProperty("--camera-control-pane-left", Math.max(0, (controlPane?.left ?? width()) - cameraLeft) + "px");
    root.style.setProperty("--camera-control-pane-width", Math.max(0, controlPane?.width ?? 0) + "px");
    // Layout coordinates must be relative to the actual camera container,
    // not the full Android display or the page's top-left origin.
    const quadVars: Record<string, number> = quad ? {
      "--camera-quad-preview-left":quad.preview.left-cameraLeft,
      "--camera-quad-preview-top":quad.preview.top-cameraTop,
      "--camera-quad-preview-width":quad.preview.width,
      "--camera-quad-preview-height":quad.preview.height,
      "--camera-quad-hud-left":quad.hud.left-cameraLeft,
      "--camera-quad-hud-top":quad.hud.top-cameraTop,
      "--camera-quad-hud-width":quad.hud.width,
      "--camera-quad-hud-height":quad.hud.height,
      "--camera-quad-settings-left":quad.settings.left-cameraLeft,
      "--camera-quad-settings-top":quad.settings.top-cameraTop,
      "--camera-quad-settings-width":quad.settings.width,
      "--camera-quad-settings-height":quad.settings.height,
      "--camera-quad-controls-left":quad.controls.left-cameraLeft,
      "--camera-quad-controls-top":quad.controls.top-cameraTop,
      "--camera-quad-controls-width":quad.controls.width,
      "--camera-quad-controls-height":quad.controls.height,
    }: {};
    for(const name of [
      "--camera-quad-preview-left","--camera-quad-preview-top",
      "--camera-quad-preview-width","--camera-quad-preview-height",
      "--camera-quad-hud-left","--camera-quad-hud-top",
      "--camera-quad-hud-width","--camera-quad-hud-height",
      "--camera-quad-settings-left","--camera-quad-settings-top",
      "--camera-quad-settings-width","--camera-quad-settings-height",
      "--camera-quad-controls-left","--camera-quad-controls-top",
      "--camera-quad-controls-width","--camera-quad-controls-height",
    ]) {
      if(quad) root.style.setProperty(name,Math.max(0,quadVars[name]??0)+"px");
      else root.style.removeProperty(name);
    }
    // A tablet-like tabletop layout requires two full-width, vertically
    // stacked usable regions. Mixed perpendicular hinges create four panes
    // and must never trigger this two-zone mode.
    const stacked = panes.length === 2 &&
      Math.abs(panes[0]!.left - panes[1]!.left) < 4 &&
      Math.abs(panes[0]!.width - panes[1]!.width) < 4 &&
      panes[0]!.top + panes[0]!.height <= panes[1]!.top + 4;
    const horizontal = stacked && geometry.split === "horizontal" &&
      panes[0]!.height >= 170 && panes[1]!.height >= 170;
    root.dataset["cameraTabletop"] = horizontal ? "true" : "false";
    if (horizontal) {
      root.style.setProperty("--camera-upper-height", Math.max(0, panes[0]!.top + panes[0]!.height - cameraTop) + "px");
      root.style.setProperty("--camera-lower-top", Math.max(0, panes[1]!.top - cameraTop) + "px");
    } else {
      // Do not carry tabletop coordinates into a later book/cover layout.
      root.style.removeProperty("--camera-upper-height");
      root.style.removeProperty("--camera-lower-top");
    }
  };
  const apply = (state: DisplayTopology) => {
    if (disposed || activeAdaptation !== token || !Number.isSafeInteger(state.revision) || state.revision < 0 ||
      state.revision < lastRevision ||
      !Number.isFinite(state.widthPx) || !Number.isFinite(state.heightPx) ||
      state.widthPx <= 0 || state.heightPx <= 0 || !Array.isArray(state.foldingFeatures)) return;
    lastRevision = state.revision;
    lastNative = state;
    measure();
  };
  const content = document.querySelector(".app-scroll");
  // Coalesce resize/mutation bursts without postponing measurements forever:
  // continuous DOM mutations must not starve fold layout updates.
  const scheduleMeasure = () => {
    if (disposed || activeAdaptation !== token || refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      measure();
    });
  };
  // WindowManager, CSS resize and viewport changes can occur in bursts when
  // the hinge animates. One RAF update avoids repeated synchronous DOM writes.
  window.addEventListener("resize", scheduleMeasure);
  window.addEventListener("orientationchange", scheduleMeasure);
  window.visualViewport?.addEventListener("resize", scheduleMeasure);
  const geometryObserver = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(scheduleMeasure) : null;
  const shell = document.querySelector(".app-shell");
  if (shell) geometryObserver?.observe(shell);
  const camera = document.querySelector(".camera-screen");
  if (camera) geometryObserver?.observe(camera);
  let observedCamera: Element | null = camera;
  const mutations = content && typeof MutationObserver !== "undefined" ? new MutationObserver(() => {
    // Tabs remount their camera subtree. Stop observing the detached node:
    // otherwise ResizeObserver can hold old React components indefinitely.
    const nextCamera = document.querySelector(".camera-screen");
    if (nextCamera !== observedCamera) {
      if (observedCamera) geometryObserver?.unobserve(observedCamera);
      if (nextCamera) geometryObserver?.observe(nextCamera);
      observedCamera = nextCamera;
    }
    scheduleMeasure();
  }) : null;
  if (content) mutations?.observe(content, { childList: true, subtree: true });
  measure();
  if (Capacitor.isNativePlatform()) {
    void NativeDisplay.addListener("topologyChanged", apply).then(handle => {
      if (disposed) { void handle.remove(); return; }
      listener = handle;
      void NativeDisplay.startObserving({ ownerId }).then(state => {
        if (disposed) {
          // A slow native start may finish AFTER the React screen unmounted.
          // Stop it again so it cannot leak a WindowManager observer.
          void NativeDisplay.stopObserving({ ownerId }).catch(() => undefined);
          return;
        }
        apply(state);
      }).catch(() => { if (!disposed && activeAdaptation === token) root.dataset["foldInfo"] = "unknown"; });
    }).catch(() => { if (!disposed && activeAdaptation === token) root.dataset["foldInfo"] = "unknown"; });
  }
  return () => {
    disposed = true;
    forgetActiveFoldSnapshot(token);
    window.removeEventListener("resize", scheduleMeasure);
    window.removeEventListener("orientationchange", scheduleMeasure);
    window.visualViewport?.removeEventListener("resize", scheduleMeasure);
    mutations?.disconnect();
    if (observedCamera) geometryObserver?.unobserve(observedCamera);
    observedCamera = null;
    geometryObserver?.disconnect();
    cancelAnimationFrame(refreshFrame);
    void listener?.remove();
    if (Capacitor.isNativePlatform()) void NativeDisplay.stopObserving({ ownerId }).catch(() => {});
    if (activeAdaptation === token) {
      activeAdaptation = null;
      ["foldInfo","foldCount","foldSplit","separatingFold","occludingFold","foldRegions","foldWorkspace","cameraSplit","cameraTabletop","windowClass","windowHeight"].forEach(key => { delete root.dataset[key]; });
      ["--app-viewport-height","--fold-work-left","--fold-work-width","--fold-work-height","--fold-work-y-offset","--camera-left-pane-width","--camera-right-pane-left","--camera-right-pane-width","--camera-control-pane-left","--camera-control-pane-width","--camera-upper-height","--camera-lower-top","--camera-quad-preview-left","--camera-quad-preview-top","--camera-quad-preview-width","--camera-quad-preview-height","--camera-quad-hud-left","--camera-quad-hud-top","--camera-quad-hud-width","--camera-quad-hud-height","--camera-quad-settings-left","--camera-quad-settings-top","--camera-quad-settings-width","--camera-quad-settings-height","--camera-quad-controls-left","--camera-quad-controls-top","--camera-quad-controls-width","--camera-quad-controls-height"].forEach(key => root.style.removeProperty(key));
    }
  };
}
