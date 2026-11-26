import type { NativeCameraProfile } from "./native";

type Profile = Pick<NativeCameraProfile,"sizes"|"fpsRanges"|"videoOutputSizes">;

/** Candidate sensor FPS only; neither recording nor codec operation is proved. */
export function nativeFpsCandidates(camera:Profile|null|undefined,size:string):number[]{
 if(!camera)return [];
 const output=camera.videoOutputSizes?.find(x=>x.width+"x"+x.height===size);
 if(!output || !camera.sizes.includes(size))return [];
 const ranges=camera.fpsRanges.map(text=>text.split("-").map(Number))
  .filter(pair=>pair.length===2&&pair.every(Number.isFinite)&&pair[0]!>0&&pair[0]!<=pair[1]!);
 if(!ranges.length)return [];
 return [24,25,30,60].filter(fps=>
  (output.theoreticalMaxFps===undefined || !Number.isFinite(output.theoreticalMaxFps) ||
    fps<=output.theoreticalMaxFps+0.5) &&
  ranges.some(pair=>fps>=pair[0]!&&fps<=pair[1]!));
}
export function validNativeSelection(camera:Profile|null|undefined,size:string,fps:number){
 if(!camera)return {size:"",fps:0,choices:[] as number[]};
 const sizes=[...new Set(camera.sizes.filter(s=>/^\d{3,4}x\d{3,4}$/.test(s)))];
 // A persisted mode can refer to a disconnected lens or an OEM may
 // advertise a size but not report any matching AE range. Choose the first
 // ACTUAL candidate rather than leaving the user stranded at FPS=0.
 const ordered=[size,"1920x1080",...sizes].filter((s,i,all)=>
   sizes.includes(s)&&all.indexOf(s)===i);
 for(const selected of ordered){
   const choices=nativeFpsCandidates(camera,selected);
   if(!choices.length)continue;
   const chosen=choices.includes(fps)?fps:choices.includes(30)?30:choices[0]!;
   return {size:selected,fps:chosen,choices};
 }
 return {size:"",fps:0,choices:[] as number[]};
}

/** Encoder declarations cannot confirm a recording, but an explicit AVC
 * rejection must not be offered as a usable Camera2 record mode. Missing or
 * broken vendor metadata stays UNKNOWN rather than being fabricated.
 */
export function declaredAvcRecordingSupport(
 encoders:{mime:string;declaredSizeRate:boolean}[]|null|undefined,
):"declared"|"unsupported"|"unknown" {
 if(!encoders)return "unknown";
 const avc=encoders.filter(item=>item?.mime?.toLowerCase()==="video/avc");
 if(avc.length===0)return "unknown";
 if(avc.some(item=>item.declaredSizeRate===true))return "declared";
 return avc.every(item=>item.declaredSizeRate===false)?"unsupported":"unknown";
}

/** High-speed Camera2 sessions use a separate constrained capture path.
 * This is a declaration-only, bounded list, not a supported recording
 * claim. Never merge it into normal 24/30/60-fps selections.
 */
export function declaredHighSpeedCandidates(
  camera: Pick<NativeCameraProfile,"highSpeed"> | null | undefined,
): {size:string;fps:number;evidence:"camera2-declared-only"}[] {
  const result:{size:string;fps:number;evidence:"camera2-declared-only"}[]=[];
  const seen=new Set<string>();
  const groups=Array.isArray(camera?.highSpeed)?camera.highSpeed.slice(0,128):[];
  for(const group of groups){
    if(!group || typeof group.size!=="string" || !Array.isArray(group.fps))continue;
    const m=/^(\d{2,5})x(\d{2,5})$/.exec(group.size);
    if(!m)continue;
    const width=Number(m[1]),height=Number(m[2]);
    if(width<80||width>8192||height<80||height>8192)continue;
    for(const fps of group.fps.slice(0,32)){
      if(!Number.isSafeInteger(fps)||fps<60||fps>960)continue;
      const key=group.size+"|"+fps;
      if(seen.has(key))continue;
      seen.add(key);result.push({size:group.size,fps,evidence:"camera2-declared-only"});
      if(result.length>=32)return result;
    }
  }
  return result;
}

export interface HighSpeedRecordingOption {key:string;cameraId:string;size:string;fps:number}
/** Snapshot the actual declared Camera2 mode independently of later lens removal. */
export function highSpeedRecordingOptions(profiles:readonly Pick<NativeCameraProfile,"cameraId"|"highSpeed">[]):HighSpeedRecordingOption[]{
 const result:HighSpeedRecordingOption[]=[],seen=new Set<string>();
 for(const camera of profiles.slice(0,64)){
  if(!camera?.cameraId)continue;
  for(const mode of declaredHighSpeedCandidates(camera)){
   if(mode.fps<120)continue;
   const key=JSON.stringify([camera.cameraId,mode.size,mode.fps]);
   if(seen.has(key))continue;
   seen.add(key);result.push({key,cameraId:camera.cameraId,size:mode.size,fps:mode.fps});
  }
 }
 return result;
}
