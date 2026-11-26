/** Read bounded persisted observations without importing the video renderer or IDB code. */
export const MAX_DIAGNOSTIC_EDITOR_BYTES=32*1024*1024;
export interface DiagnosticEditorObservation {
 captureId:number;cameraId:string;width:number;height:number;fps:number;bytes:number;
 decodedWidth:number;decodedHeight:number;durationSeconds:number|null;checkedAt:number;
}
export const EDITOR_OBSERVATION_KEY="multicam-diagnostic-editor-v1";
const positive=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
export function validObservation(value:unknown):value is DiagnosticEditorObservation{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const x=value as DiagnosticEditorObservation;
 return positive(x.captureId)&&typeof x.cameraId==="string"&&x.cameraId.length>0&&
 [x.width,x.height,x.fps,x.bytes,x.decodedWidth,x.decodedHeight,x.checkedAt].every(positive)&&
 x.bytes>=1024&&x.bytes<=MAX_DIAGNOSTIC_EDITOR_BYTES&&
 (x.durationSeconds===null||(typeof x.durationSeconds==="number"&&Number.isFinite(x.durationSeconds)&&x.durationSeconds>0));
}
export function readDiagnosticEditorObservations():DiagnosticEditorObservation[]{
 return readUniqueRows(EDITOR_OBSERVATION_KEY,validObservation,(a,b)=>
  a.captureId===b.captureId&&a.cameraId===b.cameraId&&a.width===b.width&&a.height===b.height&&
  a.fps===b.fps&&a.bytes===b.bytes&&a.decodedWidth===b.decodedWidth&&a.decodedHeight===b.decodedHeight);
}
export interface DiagnosticExportObservation {
 captureId:number;cameraId:string;width:number;height:number;fps:number;
 outputWidth:number;outputHeight:number;outputBytes:number;durationSeconds:number|null;checkedAt:number;
}
export const EXPORT_OBSERVATION_KEY="multicam-diagnostic-export-v1";
export const MAX_DIAGNOSTIC_EXPORT_BYTES=16*1024*1024;
export function validExportObservation(v:unknown):v is DiagnosticExportObservation{
 if(!v||typeof v!=="object"||Array.isArray(v))return false;
 const x=v as DiagnosticExportObservation;
 return typeof x.cameraId==="string"&&!!x.cameraId&&
 [x.captureId,x.width,x.height,x.fps,x.outputWidth,x.outputHeight,x.outputBytes,x.checkedAt].every(positive)&&
 x.outputWidth===1280&&x.outputHeight===720&&x.outputBytes>=1024&&x.outputBytes<=MAX_DIAGNOSTIC_EXPORT_BYTES&&
 (x.durationSeconds===null||(typeof x.durationSeconds==="number"&&Number.isFinite(x.durationSeconds)&&x.durationSeconds>0));
}
export function readDiagnosticExportObservations():DiagnosticExportObservation[]{
 return readUniqueRows(EXPORT_OBSERVATION_KEY,validExportObservation,(a,b)=>
  a.captureId===b.captureId&&a.cameraId===b.cameraId&&a.width===b.width&&a.height===b.height&&a.fps===b.fps);
}

/** One native capture contributes at most one row to each coverage stage.
 * Equal duplicates keep the newest timestamp; conflicting modes are rejected.
 */
function readUniqueRows<T extends {captureId:number;cameraId:string;width:number;height:number;fps:number;checkedAt:number}>(
 storageKey:string,validate:(value:unknown)=>value is T,sameIdentity:(a:T,b:T)=>boolean,
):T[]{
 try{
  const raw=localStorage.getItem(storageKey);
  if(!raw||raw.length>65536)return [];
  const parsed:unknown=JSON.parse(raw);
  if(!Array.isArray(parsed))return [];
  const byCapture=new Map<number,T>(),conflicted=new Set<number>();
  for(const value of parsed.slice(-256)){
   if(!validate(value))continue;
   const previous=byCapture.get(value.captureId);
   if(previous&&!sameIdentity(previous,value)){
    byCapture.delete(value.captureId);conflicted.add(value.captureId);continue;
   }
   if(conflicted.has(value.captureId))continue;
   if(!previous||value.checkedAt>=previous.checkedAt)byCapture.set(value.captureId,value);
  }
  return [...byCapture.values()].sort((a,b)=>a.checkedAt-b.checkedAt).slice(-64);
 }catch{return [];}
}
export function diagnosticExportCandidate(captureId:number|undefined):DiagnosticEditorObservation|null{
 if(!positive(captureId))return null;
 return readDiagnosticEditorObservations().filter(r=>
  r.captureId===captureId&&r.durationSeconds!==null&&r.durationSeconds>=.5&&r.durationSeconds<=10)
  .reduce<DiagnosticEditorObservation|null>((latest,row)=>!latest||row.checkedAt>latest.checkedAt?row:latest,null);
}
