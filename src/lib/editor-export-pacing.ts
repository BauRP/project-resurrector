/**
 * Canvas/MediaRecorder output is explicitly 30fps. A 60-120Hz Android
 * compositor may fire requestAnimationFrame much faster. Skip redundant
 * offscreen redraws without changing the encoder's resolution/bitrate/fps.
 * A 26ms tolerance keeps ~30Hz virtual devices from dropping alternate
 * frames due to jitter just below 33.33ms.
 */
export const MIN_EXPORT_FRAME_GAP_MS = 26;
export function shouldPaintExportFrame(nowMs:number,lastPaintMs:number):boolean {
  return Number.isFinite(nowMs) && (
    nowMs < lastPaintMs ||
    nowMs-lastPaintMs>=MIN_EXPORT_FRAME_GAP_MS
  );
}

/** Progress is exposed in whole percentages. Sending the exact same value
 * on every RAF forces redundant React updates and Capacitor bridge work. */
export function makeExportProgressReporter(
  report:(percent:number)=>void,
): (percent:number)=>void {
  let last=-1;
  return (percent:number)=>{
    if(!Number.isFinite(percent))return;
    const next=Math.min(100,Math.max(0,Math.floor(percent)));
    if(next===last)return;
    last=next;
    report(next);
  };
}
