import type { NativeCameraProfile } from "./native";
import type { StabilizationProbeResult } from "./stabilization-probe";
import { decideStabilizationForRecordedMode } from "./stabilization-policy";
export interface StabilizationTrial {cameraId:string;width:number;height:number;fps:number}
/** Small, per-lens preview trials only. The native YUV and AE declarations
 * must still be checked before opening a session. No capture files. */
export function stabilizationTrialPlan(profiles:readonly NativeCameraProfile[], saved:readonly StabilizationProbeResult[]):StabilizationTrial[]{
 const trials:StabilizationTrial[]=[];
 const keys=new Set<string>();
 for(const c of profiles.slice(0,64)){
  if(!c?.cameraId||!Array.isArray(c.sizes)||!Array.isArray(c.fpsRanges))continue;
  const ranges=c.fpsRanges.map(r=>typeof r==="string"?r.split("-").map(Number):[]).filter(r=>r.length===2&&r.every(Number.isSafeInteger)&&r[0]!>0&&r[1]!>=r[0]!);
  for(const [width,height,fps] of [[1280,720,30],[1920,1080,30],[1280,720,60],[1920,1080,60]] as const){
   if(!c.sizes.includes(width+"x"+height)||!ranges.some(r=>r[1]===fps))continue;
   const output=c.videoOutputSizes?.find(m=>m.width===width&&m.height===height);
   if(output&&typeof output.theoreticalMaxFps==="number"&&Number.isFinite(output.theoreticalMaxFps)&&output.theoreticalMaxFps+.5<fps)continue;
   const trial={cameraId:c.cameraId,width,height,fps},key=JSON.stringify(trial);
   if(keys.has(key)||saved.some(p=>decideStabilizationForRecordedMode(p,trial).systemState!=="unknown"))continue;
   keys.add(key);trials.push(trial);
  }
 }
 return trials;
}
