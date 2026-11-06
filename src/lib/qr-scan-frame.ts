/** Bound QR decoding work independently of sensor resolution.
 * A 4K camera should not allocate and search an 8MP canvas six times
 * a second. Invalid OEM dimensions must never allocate huge buffers.
 */
export function qrScanDimensions(
  videoWidth:number,videoHeight:number,maxEdge=640,
):{width:number;height:number}|null{
  if(!Number.isFinite(videoWidth)||!Number.isFinite(videoHeight)||
     !Number.isSafeInteger(videoWidth)||!Number.isSafeInteger(videoHeight)||
     videoWidth<=0||videoHeight<=0||videoWidth>16384||videoHeight>16384||
     !Number.isFinite(maxEdge)||!Number.isSafeInteger(maxEdge)||
     maxEdge<32||maxEdge>2048) return null;
  const scale=Math.min(1,maxEdge/Math.max(videoWidth,videoHeight));
  return {width:Math.max(1,Math.round(videoWidth*scale)),
    height:Math.max(1,Math.round(videoHeight*scale))};
}
