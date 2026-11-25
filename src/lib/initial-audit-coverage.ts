import type {CameraAuditCheckpoint} from "./first-run-camera-audit";
import type {NativeAuditHistory} from "./native-audit-report";
import {matchInitialAuditRecordings} from "./initial-audit-recording-evidence";
export const AUDIT_EVIDENCE_CHANGED="multicam-audit-evidence-changed";
export interface AuditRecordingCoverage {total:number;recorded:number;unconfirmed:number}
/** Plan coverage, not the entire diagnosis or a declaration of current
 * device availability. No native camera is opened to compute this. */
export function auditRecordingCoverage(passport:CameraAuditCheckpoint,history:NativeAuditHistory):AuditRecordingCoverage{
 const planned=new Set<string>();
 const key=(id:string,w:number,h:number,f:number)=>JSON.stringify([id,w,h,f]);
 if(passport.schema!==2||!Array.isArray(passport.activeCameraIds))return {total:0,recorded:0,unconfirmed:0};
 for(const id of new Set(passport.activeCameraIds.slice(0,64))){
  const c=passport.cameras?.[id];
  if(!c||c.cameraId!==id||c.state!=="metadata-collected"||c.planVersion!==2||
    c.planState!=="complete"||!Number.isSafeInteger(c.codecCheckedAt)||(c.codecCheckedAt??0)<=0||
    c.planCodecCheckedAt!==c.codecCheckedAt||!Array.isArray(c.functionalPlan)||!Array.isArray(c.codecChecks))continue;
  for(const m of c.functionalPlan.slice(0,8)){
   if(!m||m.cameraId!==id||m.evidence!=="declared-compatible-only"||m.status!=="not-run"||m.verifiedRecording!==false||
     !Number.isSafeInteger(m.width)||!Number.isSafeInteger(m.height)||
     m.width<160||m.height<120||m.width>3840||m.height>2160||![24,25,30,60].includes(m.fps))continue;
   if(c.codecChecks.some(check=>check&&check.status==="declared-compatible"&&check.width===m.width&&check.height===m.height&&check.fpsRequested===m.fps&&
     Array.isArray(check.encoders)&&check.encoders.some(e=>e&&e.mime==="video/avc"&&e.declaredOnly===true)))planned.add(key(id,m.width,m.height,m.fps));
  }
 }
 let recorded=0,unconfirmed=0;
 for(const row of matchInitialAuditRecordings(passport,history)){
  if(!planned.has(key(row.cameraId,row.width,row.height,row.fps)))continue;
  if(row.state==="recorded")recorded++;else unconfirmed++;
 }
 return {total:planned.size,recorded,unconfirmed};
}
