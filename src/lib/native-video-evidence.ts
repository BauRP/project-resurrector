import type { NativeMp4Inspection } from "./native";
import type { ModeEvidence } from "./camera-passport";
const safeCount=(value:unknown,minimum=0):value is number=>
 typeof value==="number"&&Number.isSafeInteger(value)&&value>=minimum;
/** A bounded Camera2 high-speed MP4 scan is recording evidence, not full-file
 * verification. Require independent, monotonic sample windows at head and tail.
 */
export function highSpeedRecordedModeEvidence(
 cameraId:string,requested:{width:number;height:number;fps:number},
 output:{bytes:number;inspection?:NativeMp4Inspection;inspectionError?:string},checkedAt:number,
):ModeEvidence{
 const inspected=output.inspection;
 const requestedValid=!!cameraId&&[requested.width,requested.height,requested.fps].every(n=>Number.isSafeInteger(n)&&n>0);
 const filePresent=safeCount(output.bytes,1024);
 const width=inspected?.width,height=inspected?.height;
 const inspectedDimensions=typeof width==="number"&&typeof height==="number"&&Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0;
 const dimensionsMatch=inspectedDimensions&&width===requested.width&&height===requested.height;
 const videoTrackPresent=typeof inspected?.mime==="string"&&inspected.mime.toLowerCase().startsWith("video/");
 const headSamplesValid=!!inspected&&safeCount(inspected.samplesRead,8)&&safeCount(inspected.timestampSpanUs,200001)&&
  inspected.outOfOrderPresentationTimes===0&&inspected.duplicatePresentationTimes===0;
 const tailFirst=inspected?.tailFirstPresentationTimeUs,tailLast=inspected?.tailLastPresentationTimeUs;
 const tailSamplesValid=!!inspected&&safeCount(inspected.tailSamplesRead,8)&&
  typeof tailFirst==="number"&&Number.isSafeInteger(tailFirst)&&tailFirst>=0&&
  typeof tailLast==="number"&&Number.isSafeInteger(tailLast)&&tailLast>tailFirst&&tailLast-tailFirst>200000&&
  inspected.tailOutOfOrderPresentationTimes===0&&inspected.tailDuplicatePresentationTimes===0;
 const sampleMatches=(fps:number|null|undefined)=>typeof fps==="number"&&Number.isFinite(fps)&&
  Math.abs(fps-requested.fps)<=Math.max(2,requested.fps*.1);
 const bothSamplesMatch=headSamplesValid&&tailSamplesValid&&sampleMatches(inspected?.estimatedSampleFps)&&sampleMatches(inspected?.tailEstimatedSampleFps);
 const tailNearEnd=inspected?.tailSampleNearDeclaredEnd===true;
 const state:ModeEvidence["state"]=requestedValid&&filePresent&&inspectedDimensions&&dimensionsMatch&&videoTrackPresent&&bothSamplesMatch&&tailNearEnd?"recorded":"unknown";
 const details=!inspected?"Анализ MP4 недоступен; разрешение и FPS кодека неизвестны.":
  !inspectedDimensions?"Декодированное разрешение MP4 не получено.":
  !dimensionsMatch?"Размер видеодорожки MP4 отличается от запрошенного режима.":
  !videoTrackPresent?"В MP4 не подтверждена видеодорожка.":
  !headSamplesValid?"Начальная выборка MP4 слишком короткая или содержит неверные временные метки.":
  !tailSamplesValid?"Концевая выборка MP4 слишком короткая или содержит повторы/перестановки временных меток.":
  !bothSamplesMatch?"FPS в начале или конце MP4 не соответствует выбранному режиму.":
  !tailNearEnd?"Выборка не подтверждает кадры вблизи конца MP4.":
  "Размер MP4 совпал; чистые выборки начала и конца близки к выбранному FPS.";
 return {api:"camera2",cameraId,requested,checkedAt,state,
  ...(inspectedDimensions&&filePresent?{file:{width:width!,height:height!,bytes:output.bytes,mimeType:videoTrackPresent?inspected!.mime:"video/unknown"}}:{}),
  message:(filePresent?"Нативный MP4 сохранён. ":"MP4 не сохранён. ")+details+" Проверка всех кадров, стабилизации и качества звука не выполнена."};
}
