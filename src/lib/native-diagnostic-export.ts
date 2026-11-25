import {readDiagnosticEditorObservations,type DiagnosticEditorObservation} from "./native-diagnostic-editor";
import {readPersistedClip,saveRecordedClip,sampledClipBytesMatch,type RecordedClip} from "./clip-persistence";
import {verifyDecodedVideoBlob,type DecodedVideoEvidence} from "./clip-playback";
import {planSimpleVideoRender,renderSimpleVideoWebm,type SimpleRenderPlan} from "./editor-webm-render";
import type {EditorExportConfig,EditorRenderResult} from "./editor-render-bridge";

export interface DiagnosticExportObservation {
 captureId:number;cameraId:string;width:number;height:number;fps:number;
 outputWidth:number;outputHeight:number;outputBytes:number;durationSeconds:number|null;checkedAt:number;
}
const KEY="multicam-diagnostic-export-v1";
const MAX_BYTES=16*1024*1024;
const positive=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
function validRow(v:unknown):v is DiagnosticExportObservation{
 if(!v||typeof v!=="object"||Array.isArray(v))return false;
 const x=v as DiagnosticExportObservation;
 return typeof x.cameraId==="string"&&!!x.cameraId&&[x.captureId,x.width,x.height,x.fps,x.outputWidth,x.outputHeight,x.outputBytes,x.checkedAt].every(positive)&&
 x.outputWidth===1280&&x.outputHeight===720&&x.outputBytes>=1024&&x.outputBytes<=MAX_BYTES&&
 (x.durationSeconds===null||(typeof x.durationSeconds==="number"&&Number.isFinite(x.durationSeconds)&&x.durationSeconds>0));
}
export function readDiagnosticExportObservations():DiagnosticExportObservation[]{
 try{const raw=localStorage.getItem(KEY);if(!raw||raw.length>65536)return [];
 const rows:unknown=JSON.parse(raw);return Array.isArray(rows)?rows.slice(-64).filter(validRow):[];
 }catch{return [];}
}
export function diagnosticExportCandidate(captureId:number|undefined):DiagnosticEditorObservation|null{
 if(!positive(captureId))return null;
 return readDiagnosticEditorObservations().find(r=>r.captureId===captureId&&r.durationSeconds!==null&&r.durationSeconds>=.5&&r.durationSeconds<=10)??null;
}
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
 if(rendered.blob.type!=="video/webm"||rendered.blob.size<1024||rendered.blob.size>MAX_BYTES)throw Error("Результат WebM не подтверждён");
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
 if(!validRow(evidence))throw Error("Некорректный результат экспорта");
 localStorage.setItem(KEY,JSON.stringify([...readDiagnosticExportObservations().filter(x=>x.captureId!==row.captureId),evidence].slice(-64)));
 progress(100);
 return evidence;
}
