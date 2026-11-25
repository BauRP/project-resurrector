import type {NativeCaptureStatus} from "./native-capture";
import type {NativeAuditHistory} from "./native-audit-report";
import type {InitialAuditMode} from "./initial-audit-recording-evidence";
import {nativeRecordedModeEvidence} from "./native-recorded-mode-evidence";

export function validDiagnosticMode(mode:InitialAuditMode):boolean{
 const [w,h]=mode.size.split("x").map(Number);
 return !!mode.cameraId && w!==undefined && h!==undefined &&
 Number.isSafeInteger(w)&&Number.isSafeInteger(h)&&w>=160&&h>=120&&w<=3840&&h<=2160&&
 [24,25,30,60].includes(mode.fps);
}
export function diagnosticClipDisposition(status:NativeCaptureStatus,previousId:number,mode:InitialAuditMode,expectedId?:number):
 "wait"|"foreign"|"failed"|"finished" {
 const id=status.captureId;
 if(!Number.isSafeInteger(id)||id===undefined||id<=previousId)return "wait";
 if((expectedId!==undefined&&id!==expectedId)||status.diagnosticClip!==true||
 status.cameraId!==mode.cameraId||status.width+"x"+status.height!==mode.size||status.fps!==mode.fps)return "foreign";
 if(status.captureServiceActive!==false)return "wait";
 return status.state==="saved"?"finished":
 ["error","interrupted","saved_interrupted","idle","stopped"].includes(status.state)?"failed":"wait";
}
export function durableDiagnosticClip(history:NativeAuditHistory,id:number,mode:InitialAuditMode):boolean{
 if(!Array.isArray(history.entries))return false;
 const row=history.entries.find(r=>r&&r["captureId"]===id&&r["diagnosticClip"]===true&&
 r["cameraId"]===mode.cameraId&&r["width"]+"x"+r["height"]===mode.size&&r["fps"]===mode.fps&&
 r["evidenceVersion"]===2&&r["audioRequested"]===false);
 return !!row&&typeof row["savedAt"]==="number"&&nativeRecordedModeEvidence(row as unknown as NativeCaptureStatus,row["savedAt"])?.state==="recorded";
}
/** Foreground-only bounded wait. Never start the next clip on an old ack,
 * another session, a failed result, or before Android service destruction. */
export async function waitForDiagnosticClip(input:{
 previousId:number;mode:InitialAuditMode;initial:NativeCaptureStatus;
 status:()=>Promise<NativeCaptureStatus>;history:()=>Promise<NativeAuditHistory>;
 sleep:()=>Promise<void>;now:()=>number;continue:()=>boolean;
 onStatus:(s:NativeCaptureStatus)=>void;
}):Promise<"recorded"|"failed"|"cancelled"|"unknown">{
 const deadline=input.now()+45000;
 let current=input.initial;
 let expectedId:number|undefined;
 for(let n=0;n<60&&input.now()<deadline;n++){
  if(!input.continue())return "cancelled";
  const disposition=diagnosticClipDisposition(current,input.previousId,input.mode,expectedId);
  if(disposition==="foreign")return "unknown";
  const id=current.captureId;
  if(id!==undefined&&id>input.previousId)expectedId=id;
  input.onStatus(current);
  if(disposition==="failed")return "failed";
  if(disposition==="finished"&&expectedId!==undefined){
    const journal=await input.history();
    if(!input.continue())return "cancelled";
    return durableDiagnosticClip(journal,expectedId,input.mode)?"recorded":"failed";
  }
  await input.sleep();
  if(!input.continue()||input.now()>=deadline)return input.continue()?"unknown":"cancelled";
  current=await input.status();
 }
 return "unknown";
}
