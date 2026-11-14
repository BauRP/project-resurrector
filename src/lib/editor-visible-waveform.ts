/**
 * Screen-windowed timeline waveform. A two-hour clip has 144,000 source
 * peaks (20/s), but at most a few hundred DOM rects should be rendered.
 * At low zoom, merging peaks takes their MAXIMUM, retaining transients.
 * The underlying full-length original peaks are never modified.
 */
/**
 * Audio peaks are original signal extrema. Store their maxima in a lazily
 * built heap so a two-hour track can ask for ~300 visible columns without
 * rescanning 144,000 samples on every playback frame.
 *
 * WeakMap ties the 2MiB-ish pyramid to the original peaks array's lifetime;
 * cleared media and disposed editor data can be reclaimed normally.
 */
const peakTrees=new WeakMap<readonly number[],{base:number;data:Float32Array}>();
function exactPeak(value:number|undefined):number {
  return value!==undefined&&Number.isFinite(value)?Math.min(1,Math.abs(value)):0;
}
function peakRangeMax(peaks:readonly number[],first:number,end:number):number {
  if(end<=first)return 0;
  // Building the index for 1-15 values would cost more than scanning.
  if(peaks.length<128||end-first<16){
    let peak=0;
    for(let i=first;i<end;i++)peak=Math.max(peak,exactPeak(peaks[i]));
    return peak;
  }
  let tree=peakTrees.get(peaks);
  if(!tree){
    let base=1;
    while(base<peaks.length)base*=2;
    const data=new Float32Array(2*base);
    for(let i=0;i<peaks.length;i++)data[base+i]=exactPeak(peaks[i]);
    for(let i=base-1;i>0;i--)data[i]=Math.max(data[i*2]!,data[i*2+1]!);
    tree={base,data};
    peakTrees.set(peaks,tree);
  }
  let left=first+tree.base,right=end+tree.base,peak=0;
  while(left<right){
    if(left%2===1)peak=Math.max(peak,tree.data[left++]!);
    if(right%2===1)peak=Math.max(peak,tree.data[--right]!);
    left=Math.floor(left/2);
    right=Math.floor(right/2);
  }
  return peak;
}

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
    // Reverse clips use the same original amplitudes with the source-index
    // interval reversed. The maximum over the interval is invariant.
    const from=reverse?finish-end:start+k;
    const to=reverse?finish-k:start+end;
    const peak=peakRangeMax(peaks,from,to);
    columns.push({index:k,x:k/count*100,width:(end-k)/count*100*0.8,
      y:50-peak*48,height:Math.max(1,peak*96)});
  }
  return columns;
}
