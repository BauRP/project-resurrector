/** Preserve all original waveform peaks, yield between batches so Android
 * WebView can service touch and navigation while scanning decoded PCM.
 * This does not reduce audio quality, waveform density or input duration. */
export async function extractWaveformPeaks(samples: Float32Array,duration:number,
  shouldCancel:()=>boolean=()=>false):Promise<number[]>{
  const count=Math.max(20,Math.round(duration*20));
  if(!Number.isFinite(count)||count>2_000_000)
    throw new Error("Длительность звуковой дорожки недостоверна");
  const step=Math.floor(samples.length/count)||1;
  const peaks:number[]=[];
  // One waveform column can span millions of PCM samples when media metadata
  // reports a short duration for a large decoded buffer. Yield INSIDE each
  // column as well, so Android taps and navigation can interrupt the analysis.
  let samplesSinceYield = 0;
  for(let i=0;i<count;i++){
    if(shouldCancel())throw new Error("Анализ волны прерван");
    let max=0;
    for(let j=i*step;j<(i+1)*step&&j<samples.length;j++){
      max=Math.max(max,Math.abs(samples[j]??0));
      if(++samplesSinceYield>=16384){
        samplesSinceYield=0;
        await new Promise<void>(r=>setTimeout(r,0));
        if(shouldCancel())throw new Error("Анализ волны прерван");
      }
    }
    peaks.push(max);
    if(i>0&&i%512===0)await new Promise<void>(r=>setTimeout(r,0));
  }
  return peaks;
}
