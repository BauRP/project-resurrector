/** A JPEG polling response can contain the SAME encoded frame many times.
 * Avoid decoding and repainting it repeatedly. Old native bridges without
 * frameAt remain usable until the matching Android code is installed.
 */
export function isFreshNativeFrame(
  frame:{jpeg:string;frameAt?:number},lastFrameAt:number,
):boolean {
  if(!frame.jpeg)return false;
  if(typeof frame.frameAt!=="number"||!Number.isFinite(frame.frameAt)||frame.frameAt<=0)
    return true;
  return frame.frameAt!==lastFrameAt;
}
