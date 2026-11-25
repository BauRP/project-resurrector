import type {NativeCaptureStatus} from "./native-capture";
import type {DiagnosticEditorObservation} from "./native-diagnostic-editor";
import type {DiagnosticExportObservation} from "./native-diagnostic-export";
export type DiagnosticPipelineStage="editor"|"export";
export async function runDiagnosticPipeline(
 status:NativeCaptureStatus,signal:AbortSignal,onStage:(stage:DiagnosticPipelineStage,progress:number)=>void,
 deps:{
  importClip:(status:NativeCaptureStatus,signal:AbortSignal)=>Promise<DiagnosticEditorObservation>;
  render:(row:DiagnosticEditorObservation,signal:AbortSignal,progress:(n:number)=>void)=>Promise<DiagnosticExportObservation>;
  canContinue:()=>boolean|Promise<boolean>;
 }
):Promise<DiagnosticExportObservation>{
 const active=()=>{if(signal.aborted)throw Error("Диагностика остановлена");};
 const check=async()=>{active();if(!await deps.canContinue())throw Error("Диагностика отложена: камера или ресурсы заняты");active();};
 await check();
 if(status.state!=="saved"||status.diagnosticClip!==true||status.captureServiceActive!==false||
    !Number.isSafeInteger(status.captureId)||(status.captureId??0)<=0)throw Error("Нет завершённой видеопробы");
 onStage("editor",0);
 const row=await deps.importClip(status,signal);
 active();
 if(row.captureId!==status.captureId||row.cameraId!==status.cameraId||
    row.width!==status.width||row.height!==status.height||row.fps!==status.fps||
    row.bytes!==status.savedBytes)throw Error("Результат редактора относится к другой записи");
 onStage("editor",100);
 await check();
 onStage("export",0);
 const result=await deps.render(row,signal,n=>{if(!signal.aborted)onStage("export",Math.max(0,Math.min(99,n)));});
 active();
 if(result.captureId!==row.captureId||result.cameraId!==row.cameraId||
    result.width!==row.width||result.height!==row.height||result.fps!==row.fps)
    throw Error("Результат экспорта относится к другой записи");
 onStage("export",100);
 return result;
}
