/**
 * Screen-windowed timeline waveform. A two-hour clip has 144,000 source
 * peaks (20/s), but at most a few hundred DOM rects should be rendered.
 * At low zoom, merging peaks takes their MAXIMUM, retaining transients.
 * The underlying full-length original peaks are never modified.
 */
export interface VisibleWaveformColumn {
  index:number;x:number;width:number;y:number;height:number;
}
export function visibleWaveformColumns(
  peaks:readonly number[], sourceSeconds:number, inSeconds:number,
  outSeconds:number, reverse:boolean, itemStartSeconds:number,
  clipWidthPx:number, pixelsPerSecond:number, scrollLeftPx:number,
  viewportWidthPx:number, leftHeaderPx:number, overscanPx=64,
):VisibleWaveformColumn[] {
  const values=[sourceSeconds,inSeconds,outSeconds,itemStartSeconds,clipWidthPx,
    pixelsPerSecond,scrollLeftPx,viewportWidthPx,leftHeaderPx,overscanPx];
  if(!peaks.length||!values.every(Number.isFinite)||sourceSeconds<=0||
     clipWidthPx<=0||pixelsPerSecond<=0||viewportWidthPx<=0||
     outSeconds<=inSeconds)return [];
  const start=Math.min(peaks.length,Math.max(0,Math.floor(inSeconds/sourceSeconds*peaks.length)));
  const finish=Math.min(peaks.length,Math.max(start,Math.ceil(outSeconds/sourceSeconds*peaks.length)));
  const count=finish-start;
  if(!count)return [];
  const origin=leftHeaderPx+itemStartSeconds*pixelsPerSecond;
  const first=Math.max(0,Math.floor((scrollLeftPx-overscanPx-origin)/clipWidthPx*count));
  const last=Math.min(count,Math.ceil((scrollLeftPx+viewportWidthPx+overscanPx-origin)/clipWidthPx*count));
  if(last<=first)return [];
  const maxColumns=Math.max(1,Math.min(512,Math.ceil((viewportWidthPx+2*overscanPx)/1.5)));
  const group=Math.max(1,Math.ceil((last-first)/maxColumns));
  const columns:VisibleWaveformColumn[]=[];
  for(let k=first;k<last;k+=group){
    const end=Math.min(last,k+group);
    let peak=0;
    for(let index=k;index<end;index++){
      const amplitude=peaks[reverse?finish-1-index:start+index]??0;
      if(Number.isFinite(amplitude))peak=Math.max(peak,Math.abs(amplitude));
    }
    peak=Math.min(1,peak);
    columns.push({index:k,x:k/count*100,width:(end-k)/count*100*0.8,
      y:50-peak*48,height:Math.max(1,peak*96)});
  }
  return columns;
}
