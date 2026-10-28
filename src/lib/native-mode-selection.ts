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
