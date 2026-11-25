import type { NativeCameraProfile } from "./native";
import type { StabilizationProbeResult } from "./stabilization-probe";
import { previewFramesConfirmed } from "./preview-sensor-observation";
export interface StabilizationTrial {cameraId:string;width:number;height:number;fps:number}
/** Small, per-lens preview trials only. The native YUV and AE declarations
 * must still be checked before opening a session. No capture files. */
export function stabilizationTrialPlan(profiles:readonly NativeCameraProfile[], saved:readonly StabilizationProbeResult[]):StabilizationTrial[]{
 const trials:StabilizationTrial[]=[];
 const keys=new Set<string>();
 for(const c of profiles.slice(0,64)){
  if(!c?.cameraId||!Array.isArray(c.sizes)||!Array.isArray(c.fpsRanges))continue;
  const ranges=c.fpsRanges.map(r=>typeof r==="string"?r.split("-").map(Number):[]).filter(r=>r.length===2&&r.every(Number.isSafeInteger)&&r[0]!>0&&r[1]!>=r[0]!);
  const yuv=Array.isArray(c.previewYuvSizes)?c.previewYuvSizes:null;
  const sizes=yuv??c.sizes;
  const candidates:[number,number,number][]=[[1280,720,30],[1920,1080,30],[1280,720,60],[1920,1080,60]];
  // A small/secondary lens may expose only a non-HD YUV preview. Choose
  // an actual bounded stream and an advertised AE upper limit, not a fake HD mode.
  if(yuv&&!candidates.some(([w,h,f])=>sizes.includes(w+"x"+h)&&ranges.some(r=>r[1]===f))){
   const valid=sizes.map(s=>typeof s==="string"&&/^\d{3,4}x\d{3,4}$/.test(s)?s.split("x").map(Number):[])
     .filter(a=>a.length===2&&a[0]!>=160&&a[0]!<=1920&&a[1]!>=120&&a[1]!<=1080)
     .sort((a,b)=>Math.abs(a[0]!*a[1]!-640*480)-Math.abs(b[0]!*b[1]!-640*480));
   const rate=ranges.map(r=>r[1]!).filter(f=>f<=60).sort((a,b)=>Math.abs(a-30)-Math.abs(b-30))[0];
   if(valid[0]&&rate)candidates.push([valid[0][0]!,valid[0][1]!,rate]);
  }
  for(const [width,height,fps] of candidates){
   if(!sizes.includes(width+"x"+height)||!ranges.some(r=>r[1]===fps))continue;
   // For legacy profiles, retain the former conservative video-output filter.
   // Real YUV sizes are independent of MediaRecorder dimensions.
   const output=c.videoOutputSizes?.find(m=>m.width===width&&m.height===height);
   if(!yuv&&output&&typeof output.theoreticalMaxFps==="number"&&Number.isFinite(output.theoreticalMaxFps)&&output.theoreticalMaxFps+.5<fps)continue;
   const trial={cameraId:c.cameraId,width,height,fps},key=JSON.stringify(trial);
   if(keys.has(key)||saved.some(p=>p.cameraId===trial.cameraId&&p.width===width&&p.height===height&&p.fpsRequested===fps&&previewFramesConfirmed(p)))continue;
   keys.add(key);trials.push(trial);
  }
 }
 return trials;
}
