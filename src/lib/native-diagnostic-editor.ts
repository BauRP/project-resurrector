import { Capacitor } from "@capacitor/core";
import { nativeCapture, type NativeCaptureStatus, type NativeDiagnosticEditorSource } from "./native-capture";
import { nativeRecordedModeEvidence } from "./native-recorded-mode-evidence";
import { saveRecordedClip, readPersistedClip, sampledClipBytesMatch, type RecordedClip } from "./clip-persistence";
import { verifyDecodedVideoBlob, type DecodedVideoEvidence } from "./clip-playback";
import { MAX_DIAGNOSTIC_EDITOR_BYTES, EDITOR_OBSERVATION_KEY, validObservation, readDiagnosticEditorObservations, type DiagnosticEditorObservation } from "./diagnostic-media-observations";
export { MAX_DIAGNOSTIC_EDITOR_BYTES, readDiagnosticEditorObservations, type DiagnosticEditorObservation } from "./diagnostic-media-observations";
export function eligibleDiagnosticEditorClip(s:NativeCaptureStatus|null):boolean{
 return !!s&&s.state==="saved"&&s.diagnosticClip===true&&s.captureServiceActive===false&&
 Number.isSafeInteger(s.captureId)&&(s.captureId??0)>0&&Number.isSafeInteger(s.savedBytes)&&
 s.savedBytes>=1024&&s.savedBytes<=MAX_DIAGNOSTIC_EDITOR_BYTES&&
 nativeRecordedModeEvidence(s,Date.now())?.state==="recorded";
}
export function validDiagnosticEditorSource(s:NativeCaptureStatus,source:NativeDiagnosticEditorSource):boolean{
 return eligibleDiagnosticEditorClip(s)&&source.captureId===s.captureId&&source.bytes===s.savedBytes&&
 typeof source.path==="string"&&/^\/[^\r\n]+\/native-video\/[^/\r\n]+\.mp4$/.test(source.path)&&
 !source.path.split("/").some(p=>p===".."||p===".");
}
function persistObservation(row:DiagnosticEditorObservation):void{
 if(!validObservation(row))throw Error("Некорректные результаты редактора");
 const rows=readDiagnosticEditorObservations().filter(r=>r.captureId!==row.captureId);
 localStorage.setItem(EDITOR_OBSERVATION_KEY,JSON.stringify([...rows,row].slice(-64)));
}
const ensureActive=(signal:AbortSignal)=>{if(signal.aborted)throw Error("Проверка редактора отменена");};
export async function importDiagnosticEditorClip(
 status:NativeCaptureStatus,signal:AbortSignal,
 dependencies:{
 source:(captureId:number)=>Promise<NativeDiagnosticEditorSource>;
 load:(source:NativeDiagnosticEditorSource,signal:AbortSignal)=>Promise<Blob>;
 save:(clip:RecordedClip)=>Promise<void>;
 read:(id:string)=>Promise<RecordedClip>;
 decode:(blob:Blob,signal:AbortSignal)=>Promise<DecodedVideoEvidence>;
 }={
 source:captureId=>nativeCapture.diagnosticEditorSource({captureId}),
 load:async(source,signal)=>{
  const response=await fetch(Capacitor.convertFileSrc(source.path),{signal});
  if(!response.ok)throw Error("Локальный MP4 не прочитан");
  const blob=await response.blob();
  return blob.type==="video/mp4"?blob:blob.slice(0,blob.size,"video/mp4");
 },
 save:saveRecordedClip,read:readPersistedClip,decode:verifyDecodedVideoBlob,
 }):Promise<DiagnosticEditorObservation>{
 if(!eligibleDiagnosticEditorClip(status))throw Error("Диагностический MP4 не подтверждён");
 ensureActive(signal);
 const captureId=status.captureId!;
 const source=await dependencies.source(captureId);
 ensureActive(signal);
 if(!validDiagnosticEditorSource(status,source))throw Error("Источник записи изменился");
 const blob=await dependencies.load(source,signal);
 ensureActive(signal);
 if(blob.size!==source.bytes||blob.type!=="video/mp4")throw Error("Размер или тип MP4 не совпал");
 const id="native-diagnostic-"+captureId;
 const duration=(status.mp4DurationMs??0)/1000;
 const clip:RecordedClip & {kind:"video";name:string}={
 id,createdAt:Date.now(),camera:1,cameraDeviceId:status.cameraId!,mode:"diagnostic",profile:"Camera2",
 playbackRate:1,blob,kind:"video",name:"Диагностика Camera2 "+captureId+".mp4",
 ...(Number.isFinite(duration)&&duration>0?{duration}:{})
 };
 // Add only. If an earlier write already committed, read and compare it.
 // Never overwrite an existing user clip, even after a timeout.
 try{await dependencies.save(clip);}catch{/* the read-back determines the outcome */}
 ensureActive(signal);
 const stored=await dependencies.read(id);
 ensureActive(signal);
 if(stored.id!==id||stored.blob.size!==blob.size||stored.blob.type!==blob.type||
    !await sampledClipBytesMatch(blob,stored.blob))throw Error("Медиатека не подтвердила исходные байты");
 ensureActive(signal);
 const decoded=await dependencies.decode(stored.blob,signal);
 ensureActive(signal);
 if(decoded.verifiedFirstFrame!==true||!Number.isSafeInteger(decoded.width)||decoded.width<=0||
 !Number.isSafeInteger(decoded.height)||decoded.height<=0)throw Error("Первый кадр редактора не подтверждён");
 const row:DiagnosticEditorObservation={captureId,cameraId:status.cameraId!,width:status.width!,height:status.height!,fps:status.fps!,bytes:source.bytes,
 decodedWidth:decoded.width,decodedHeight:decoded.height,durationSeconds:decoded.durationSeconds,checkedAt:Date.now()};
 persistObservation(row);
 return row;
}
