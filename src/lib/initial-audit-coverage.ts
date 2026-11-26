import type {CameraAuditCheckpoint} from "./first-run-camera-audit";
import type {NativeAuditHistory} from "./native-audit-report";
import type {DiagnosticEditorObservation,DiagnosticExportObservation} from "./diagnostic-media-observations";
import {confirmedInitialAuditRecordingRow,matchInitialAuditRecordings} from "./initial-audit-recording-evidence";
export const AUDIT_EVIDENCE_CHANGED="multicam-audit-evidence-changed";
export interface AuditRecordingCoverage {total:number;recorded:number;unconfirmed:number}
/** Plan coverage, not the entire diagnosis or a declaration of current
 * device availability. No native camera is opened to compute this. */
const key=(id:string,w:number,h:number,f:number)=>JSON.stringify([id,w,h,f]);
function plannedRecordingKeys(passport:CameraAuditCheckpoint):Set<string>{
 const planned=new Set<string>();
 if(passport.schema!==2||!Array.isArray(passport.activeCameraIds))return planned;
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
 return planned;
}
export function auditRecordingCoverage(passport:CameraAuditCheckpoint,history:NativeAuditHistory):AuditRecordingCoverage{
 const planned=plannedRecordingKeys(passport);
 let recorded=0,unconfirmed=0;
 for(const row of matchInitialAuditRecordings(passport,history)){
  if(!planned.has(key(row.cameraId,row.width,row.height,row.fps)))continue;
  if(row.state==="recorded")recorded++;else unconfirmed++;
 }
 return {total:planned.size,recorded,unconfirmed};
}

export interface AuditMediaCoverage extends AuditRecordingCoverage {editor:number;exported:number}
/** Correlate retained historical proof by exact capture ID and mode. */
export function auditMediaCoverage(passport:CameraAuditCheckpoint,history:NativeAuditHistory,
 editors:readonly DiagnosticEditorObservation[],exports:readonly DiagnosticExportObservation[]):AuditMediaCoverage{
 const base=auditRecordingCoverage(passport,history),planned=plannedRecordingKeys(passport);
 const editorModes=new Set<string>(),exportModes=new Set<string>();
 const rows=[...(Array.isArray(history.modeEntries)?history.modeEntries.slice(-128):[]),...history.entries.slice(-24)];
 for(const row of rows){
  if(!row||row["diagnosticClip"]!==true||row["state"]!=="saved"||!confirmedInitialAuditRecordingRow(row))continue;
  const k=JSON.stringify([row["cameraId"],row["width"],row["height"],row["fps"]]);
  if(!planned.has(k))continue;
  const same=(x:DiagnosticEditorObservation|DiagnosticExportObservation)=>x.captureId===row["captureId"]&&
    x.cameraId===row["cameraId"]&&x.width===row["width"]&&x.height===row["height"]&&x.fps===row["fps"];
  const editor=editors.slice(-64).find(x=>same(x)&&x.bytes===row["savedBytes"]);
  if(!editor)continue;
  editorModes.add(k);
  if(exports.slice(-64).some(x=>same(x)&&x.checkedAt>=editor.checkedAt))exportModes.add(k);
 }
 return {...base,editor:editorModes.size,exported:exportModes.size};
}
