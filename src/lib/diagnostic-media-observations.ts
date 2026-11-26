/** Read bounded persisted observations without importing the video renderer or IDB code. */
export const MAX_DIAGNOSTIC_EDITOR_BYTES=32*1024*1024;
export interface DiagnosticEditorObservation {
 captureId:number;cameraId:string;width:number;height:number;fps:number;bytes:number;
 decodedWidth:number;decodedHeight:number;durationSeconds:number|null;checkedAt:number;
}
export const EDITOR_OBSERVATION_KEY="multicam-diagnostic-editor-v1";
export function validObservation(value:unknown):value is DiagnosticEditorObservation{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const x=value as DiagnosticEditorObservation;
 const positive=(n:unknown)=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
 return positive(x.captureId)&&typeof x.cameraId==="string"&&x.cameraId.length>0&&
 [x.width,x.height,x.fps,x.bytes,x.decodedWidth,x.decodedHeight,x.checkedAt].every(positive)&&
 x.bytes>=1024&&x.bytes<=MAX_DIAGNOSTIC_EDITOR_BYTES&&
 (x.durationSeconds===null||(typeof x.durationSeconds==="number"&&Number.isFinite(x.durationSeconds)&&x.durationSeconds>0));
}
export function readDiagnosticEditorObservations():DiagnosticEditorObservation[]{
 try{const raw=localStorage.getItem(EDITOR_OBSERVATION_KEY);if(!raw||raw.length>65536)return [];
 const rows:unknown=JSON.parse(raw);return Array.isArray(rows)?rows.slice(-64).filter(validObservation):[];
 }catch{return [];}
}
export interface DiagnosticExportObservation {
 captureId:number;cameraId:string;width:number;height:number;fps:number;
 outputWidth:number;outputHeight:number;outputBytes:number;durationSeconds:number|null;checkedAt:number;
}
export const EXPORT_OBSERVATION_KEY="multicam-diagnostic-export-v1";
export const MAX_DIAGNOSTIC_EXPORT_BYTES=16*1024*1024;
const positive=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
export function validExportObservation(v:unknown):v is DiagnosticExportObservation{
 if(!v||typeof v!=="object"||Array.isArray(v))return false;
 const x=v as DiagnosticExportObservation;
 return typeof x.cameraId==="string"&&!!x.cameraId&&[x.captureId,x.width,x.height,x.fps,x.outputWidth,x.outputHeight,x.outputBytes,x.checkedAt].every(positive)&&
 x.outputWidth===1280&&x.outputHeight===720&&x.outputBytes>=1024&&x.outputBytes<=MAX_DIAGNOSTIC_EXPORT_BYTES&&
 (x.durationSeconds===null||(typeof x.durationSeconds==="number"&&Number.isFinite(x.durationSeconds)&&x.durationSeconds>0));
}
export function readDiagnosticExportObservations():DiagnosticExportObservation[]{
 try{const raw=localStorage.getItem(EXPORT_OBSERVATION_KEY);if(!raw||raw.length>65536)return [];
 const rows:unknown=JSON.parse(raw);return Array.isArray(rows)?rows.slice(-64).filter(validExportObservation):[];
 }catch{return [];}
}
export function diagnosticExportCandidate(captureId:number|undefined):DiagnosticEditorObservation|null{
 if(!positive(captureId))return null;
 return readDiagnosticEditorObservations().find(r=>r.captureId===captureId&&r.durationSeconds!==null&&r.durationSeconds>=.5&&r.durationSeconds<=10)??null;
}
