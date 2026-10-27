/** Reports only what a live WebView track actually revealed after applying constraints.
 * A resolved applyConstraints promise is never proof of encoded video FPS.
 */
export function assessTrackMode(
  expected:{width:number;height:number;fps:number},
  actual:{width?:number;height?:number;frameRate?:number},
): "confirmed"|"rejected"|"unknown" {
  const {width,height,frameRate}=actual;
  if (![expected.width,expected.height,expected.fps].every(x=>Number.isFinite(x)&&x>0))
    return "unknown";
  if ([width,height,frameRate].some(x=>x===undefined||!Number.isFinite(x)))
    return "unknown";
  const w=width!,h=height!,fps=frameRate!;
  const matched=(w===expected.width&&h===expected.height)||
    (w===expected.height&&h===expected.width);
  return matched && Math.abs(fps-expected.fps)<=1 ? "confirmed" : "rejected";
}
