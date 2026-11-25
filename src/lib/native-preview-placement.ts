import {validFoldRegionGeometry} from "./fold-recording-evidence";

/** A native TextureView is an Activity overlay, not a DOM node.
 * Only place it when its complete target fits in the visible WebView.
 * Otherwise it can cover unrelated controls after scrolling or folding.
 */
export interface PreviewRect {left:number;top:number;width:number;height:number}
export interface PreviewViewport {width:number;height:number}
/** Keep the native TextureView inside one *actual* usable fold region.
 * Unlike HTML, the Android surface is layered above the WebView and can
 * cover a hinge or controls unless it is explicitly hidden.
 * Region geometry comes from WindowManager, already mapped to CSS pixels.
 */
export function previewFitsFoldRegion(
 rect:PreviewRect, regionGeometry:string|undefined, viewport?:PreviewViewport,
):boolean {
 if(!regionGeometry)return true;
 const regions=regionGeometry.split(";");
 // One measured cover-display region can be smaller than the WebView.
 // Never interpret that lone real pane as permission to use the full screen.
 // A malformed or overlapping set of panes must never authorize native
 // overlay placement even when one individual rectangle happens to fit.
 if(!validFoldRegionGeometry(regionGeometry))return false;
 if(viewport){
   // A valid integer pane can still be an obsolete full-size WindowManager
   // observation from before the Activity shrank to a cover/split window.
   // Reject the whole report instead of authorizing an overlay from one pane.
   const epsilon=1;
   if(!Number.isFinite(viewport.width)||!Number.isFinite(viewport.height)||
      viewport.width<=0||viewport.height<=0 ||
      regions.some(region=>{
        const [x,y,w,h]=region.split(",").map(Number);
        return x===undefined||y===undefined||w===undefined||h===undefined||
          x < -epsilon || y < -epsilon ||
          x+w > viewport.width+epsilon || y+h > viewport.height+epsilon;
      }))return false;
 }
 return regions.some(region=>{
   const [x,y,w,h]=region.split(",").map(Number);
   if(![x,y,w,h].every(Number.isSafeInteger)||w===undefined||h===undefined||w<=0||h<=0)return false;
   // The region coordinates were rounded to whole CSS px in the adapter.
   const epsilon=1;
   return rect.left>=x!-epsilon && rect.top>=y!-epsilon &&
     rect.left+rect.width<=x!+w!+epsilon &&
     rect.top+rect.height<=y!+h!+epsilon;
 });
}
export function nativePreviewPlacement(
 rect:PreviewRect|null|undefined, viewport:PreviewViewport,
 regionGeometry?:string,
): PreviewRect|null {
 if(!rect || ![rect.left,rect.top,rect.width,rect.height,viewport.width,viewport.height]
    .every(n=>Number.isFinite(n)))return null;
 if(rect.width<80||rect.height<80||viewport.width<=0||viewport.height<=0)return null;
 const epsilon=1;
 if(rect.left < -epsilon || rect.top < -epsilon ||
   rect.left+rect.width > viewport.width+epsilon ||
   rect.top+rect.height > viewport.height+epsilon ||
   !previewFitsFoldRegion(rect,regionGeometry,viewport))return null;
 // Clip both ends independently: a negative subpixel origin must not
 // shift the far edge toward a control or hinge.
 const left=Math.max(0,rect.left), top=Math.max(0,rect.top);
 const width=Math.min(viewport.width,rect.left+rect.width)-left;
 const height=Math.min(viewport.height,rect.top+rect.height)-top;
 if(width<80||height<80)return null;
 const placement={left,top,width,height};
 return previewFitsFoldRegion(placement,regionGeometry,viewport) ? placement : null;
}
export function samePreviewPlacement(a:PreviewRect|null,b:PreviewRect|null):boolean {
 if(!a||!b)return a===b;
 return Math.abs(a.left-b.left)<.5&&Math.abs(a.top-b.top)<.5&&
   Math.abs(a.width-b.width)<.5&&Math.abs(a.height-b.height)<.5;
}

/** One atomic, *current* geometry snapshot for Android overlay submission.
 * Both the rectangle and WebView dimensions must be measured again when a
 * serialized async show finally executes. A stale viewport can otherwise
 * place a TextureView across a new hinge or outside the resized Activity.
 */
export function nativePreviewSnapshot(
 rect:PreviewRect|null|undefined,viewport:PreviewViewport,regionGeometry?:string,
):{placement:PreviewRect;viewport:PreviewViewport}|null {
 const placement=nativePreviewPlacement(rect,viewport,regionGeometry);
 return placement ? {placement,viewport:{width:viewport.width,height:viewport.height}} : null;
}

/** A native overlay is not clipped by the keyboard or VisualViewport.
 * Keep layout coordinates for Android scaling; hide rather than resize a
 * partially obscured surface, then restore on the next visible resize. */
export function nativePreviewInsideVisibleViewport(
  placement:PreviewRect|null, visible:{offsetLeft:number;offsetTop:number;width:number;height:number;scale:number}|null|undefined,
):boolean {
  if(!placement)return false;
  if(!visible)return true;
  const {offsetLeft,offsetTop,width,height,scale}=visible;
  if(![offsetLeft,offsetTop,width,height,scale].every(Number.isFinite)||
    width<=0||height<=0||Math.abs(scale-1)>.01)return false;
  return placement.left>=offsetLeft-.5&&placement.top>=offsetTop-.5&&
    placement.left+placement.width<=offsetLeft+width+.5&&
    placement.top+placement.height<=offsetTop+height+.5;
}

/** TextureView safety is invalidated by a REAL change in observed posture or
 * pane geometry, not by every duplicate WindowManager revision. Android may
 * have detached the native surface even when its CSS rectangle is unchanged.
 */
export interface FoldPreviewTopology {
 posture?:string;hingeCount?:number;layout?:string;regionGeometry?:string;
 /** Informational Android revision; intentionally ignored for surface refresh. */
 revision?:number;
}
export function foldPreviewTopologySignature(value:FoldPreviewTopology|null|undefined):string {
 if(!value)return "unobserved";
 return JSON.stringify([value.posture??"",value.hingeCount??-1,
   value.layout??"",value.regionGeometry??""]);
}
