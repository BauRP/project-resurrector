/** A native TextureView is an Activity overlay, not a DOM node.
 * Only place it when its complete target fits in the visible WebView.
 * Otherwise it can cover unrelated controls after scrolling or folding.
 */
export interface PreviewRect {left:number;top:number;width:number;height:number}
export interface PreviewViewport {width:number;height:number}
export function nativePreviewPlacement(
 rect:PreviewRect|null|undefined, viewport:PreviewViewport,
): PreviewRect|null {
 if(!rect || ![rect.left,rect.top,rect.width,rect.height,viewport.width,viewport.height]
    .every(n=>Number.isFinite(n)))return null;
 if(rect.width<80||rect.height<80||viewport.width<=0||viewport.height<=0)return null;
 const epsilon=1;
 if(rect.left < -epsilon || rect.top < -epsilon ||
   rect.left+rect.width > viewport.width+epsilon ||
   rect.top+rect.height > viewport.height+epsilon)return null;
 return {
   left:Math.max(0,rect.left),top:Math.max(0,rect.top),
   width:Math.min(rect.width,viewport.width-Math.max(0,rect.left)),
   height:Math.min(rect.height,viewport.height-Math.max(0,rect.top)),
 };
}
export function samePreviewPlacement(a:PreviewRect|null,b:PreviewRect|null):boolean {
 if(!a||!b)return a===b;
 return Math.abs(a.left-b.left)<.5&&Math.abs(a.top-b.top)<.5&&
   Math.abs(a.width-b.width)<.5&&Math.abs(a.height-b.height)<.5;
}
