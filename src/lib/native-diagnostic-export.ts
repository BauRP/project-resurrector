import { MAX_DIAGNOSTIC_EXPORT_BYTES, EXPORT_OBSERVATION_KEY, validExportObservation, readDiagnosticExportObservations, type DiagnosticEditorObservation, type DiagnosticExportObservation } from "./diagnostic-media-observations";
export { diagnosticExportCandidate, readDiagnosticExportObservations, type DiagnosticExportObservation } from "./diagnostic-media-observations";
import {readPersistedClip,saveRecordedClip,sampledClipBytesMatch,type RecordedClip} from "./clip-persistence";
import {verifyDecodedVideoBlob,type DecodedVideoEvidence} from "./clip-playback";
import {planSimpleVideoRender,renderSimpleVideoWebm,type SimpleRenderPlan} from "./editor-webm-render";
import type {EditorExportConfig,EditorRenderResult} from "./editor-render-bridge";

export function diagnosticExportPlan(row:DiagnosticEditorObservation):SimpleRenderPlan{
 const duration=row.durationSeconds;
 if(duration===null||!Number.isFinite(duration)||duration<.5||duration>10)throw Error("Длительность короткой пробы не подтверждена");
 // Use the actual NLE renderer, not the original-file copy branch.
 return planSimpleVideoRender([{kind:"video",mediaId:"native-diagnostic-"+row.captureId,start:0,in:0,out:Math.min(2,duration-.1),speed:1,reverse:false,opacity:100,scale:100,posX:0,look:"Без цвета"}],[],0,false,false);
}
const CONFIG:EditorExportConfig={resolution:"720p",fps:"30",aspect:"16:9",videoCodec:"VP8",audioCodec:"Opus",bitrate:3};
const active=(signal:AbortSignal)=>{if(signal.aborted)throw Error("Экспорт отменён");};
export async function runDiagnosticExport(row:DiagnosticEditorObservation,signal:AbortSignal,progress:(n:number)=>void,deps:{
 read:(id:string)=>Promise<RecordedClip>;
 save:(clip:RecordedClip)=>Promise<void>;
 render:(plan:SimpleRenderPlan,source:Blob,config:EditorExportConfig,signal:AbortSignal,progress:(n:number)=>void)=>Promise<EditorRenderResult>;
 decode:(blob:Blob,signal:AbortSignal)=>Promise<DecodedVideoEvidence>;
}={read:readPersistedClip,save:saveRecordedClip,render:renderSimpleVideoWebm,decode:verifyDecodedVideoBlob}):Promise<DiagnosticExportObservation>{
 active(signal);
 const plan=diagnosticExportPlan(row);
 const source=await deps.read(plan.segment.mediaId);
 active(signal);
 if(source.id!==plan.segment.mediaId||source.blob.size!==row.bytes||source.blob.type!=="video/mp4"||source.cameraDeviceId!==row.cameraId)
  throw Error("Исходный диагностический клип изменён");
 const rendered=await deps.render(plan,source.blob,CONFIG,signal,n=>progress(Math.min(90,Math.floor(n*.9))));
 active(signal);
 if(rendered.blob.type!=="video/webm"||rendered.blob.size<1024||rendered.blob.size>MAX_DIAGNOSTIC_EXPORT_BYTES)throw Error("Результат WebM не подтверждён");
 // Separate output, never replace original or existing render. Explicit
 // repeat gets its own ID. Save and re-read actual encoded bytes.
 const id="native-diagnostic-export-"+row.captureId+"-"+Date.now();
 const output:RecordedClip & {kind:"video";name:string}={id,createdAt:Date.now(),camera:1,mode:"diagnostic-export",profile:"VP8",playbackRate:1,blob:rendered.blob,kind:"video",name:"Диагностика экспорта "+row.captureId+".webm"};
 await deps.save(output);
 active(signal);
 const saved=await deps.read(id);
 if(saved.id!==id||!await sampledClipBytesMatch(rendered.blob,saved.blob))throw Error("Сохранённый результат экспорта отличается");
 active(signal);
 const decoded=await deps.decode(saved.blob,signal);
 active(signal);
 if(decoded.verifiedFirstFrame!==true||decoded.width!==1280||decoded.height!==720)throw Error("Размер или первый кадр WebM не подтверждён");
 const evidence:DiagnosticExportObservation={captureId:row.captureId,cameraId:row.cameraId,width:row.width,height:row.height,fps:row.fps,outputWidth:decoded.width,outputHeight:decoded.height,outputBytes:saved.blob.size,durationSeconds:decoded.durationSeconds,checkedAt:Date.now()};
 if(!validExportObservation(evidence))throw Error("Некорректный результат экспорта");
 localStorage.setItem(EXPORT_OBSERVATION_KEY,JSON.stringify([...readDiagnosticExportObservations().filter(x=>x.captureId!==row.captureId),evidence].slice(-64)));
 progress(100);
 return evidence;
}
