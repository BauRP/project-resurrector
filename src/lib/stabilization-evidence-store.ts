import type { StabilizationProbeResult } from "./stabilization-probe";
import { decideStabilizationForRecordedMode } from "./stabilization-policy";
import { previewSensorObservation, previewFramesConfirmed } from "./preview-sensor-observation";
import { cameraPassportContext } from "./camera-passport";

const KEY = "multicam-stabilization-evidence-v1";
const LIMIT = 64;
interface SavedProbe { context: string; checkedAt: number; result: StabilizationProbeResult }
function valid(value: unknown): value is SavedProbe {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SavedProbe>;
  const r = row.result;
  if (!r || typeof r.cameraId !== "string" || !r.cameraId || r.cameraId.length > 512 ||
      typeof row.context !== "string" || row.context.length > 2048 ||
      typeof row.checkedAt !== "number" || !Number.isFinite(row.checkedAt) || row.checkedAt <= 0 ||
      !Number.isSafeInteger(r.width) || !Number.isSafeInteger(r.height) ||
      !Number.isFinite(r.fpsRequested) || r.fpsRequested <= 0) return false;
  // Only evidence validated against the actual tested mode is durable.
  return decideStabilizationForRecordedMode(r,{cameraId:r.cameraId,width:r.width,height:r.height,fps:r.fpsRequested}).systemState !== "unknown";
}
function read(): SavedProbe[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > 256000) return [];
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(valid).slice(-LIMIT) : [];
  } catch { return []; }
}
const identity = (r:StabilizationProbeResult) => JSON.stringify([r.cameraId,r.width,r.height,r.fpsRequested]);
export function loadStabilizationEvidence(): StabilizationProbeResult[] {
  const context = cameraPassportContext();
  return read().filter(row=>row.context===context).map(row=>row.result);
}
/** Failed/unknown probes do not erase earlier genuine CaptureResult evidence. */
export function saveStabilizationEvidence(result:StabilizationProbeResult, checkedAt=Date.now()): boolean {
  const row:SavedProbe={context:cameraPassportContext(),checkedAt,result};
  if (!valid(row)) return false;
  try {
    const current = read();
    const key = identity(result);
    if(current.some(p=>p.context===row.context && identity(p.result)===key &&
      (p.checkedAt>checkedAt || (previewFramesConfirmed(p.result)&&!previewFramesConfirmed(result))))) return false;
    // Persist only known fields: no vendor text/path or arbitrary bridge payload.
    const {cameraId,width,height,fpsRequested,source,selected,state,eisDeclared,previewDeclared,oisDeclared,framesObserved,confirmations,captureResultEis,captureResultOis,fpsRangeApplied,fpsRangeMin,fpsRangeMax}=result;
    const sensorObservation=previewSensorObservation(result);
    const clean:StabilizationProbeResult={
      cameraId,width,height,fpsRequested,source,selected,state,eisDeclared,previewDeclared,oisDeclared,
      ...(framesObserved!==undefined?{framesObserved}:{}),
      ...(confirmations!==undefined?{confirmations}:{}),
      ...(captureResultEis!==undefined?{captureResultEis}:{}),
      ...(captureResultOis!==undefined?{captureResultOis}:{}),
      ...(fpsRangeApplied!==undefined?{fpsRangeApplied}:{}),
      ...(fpsRangeMin!==undefined?{fpsRangeMin}:{}),
      ...(fpsRangeMax!==undefined?{fpsRangeMax}:{}),
      ...(sensorObservation!==undefined?{sensorObservation}:{}),
      recordedFileVerified:false,message:"Сохранён результат тестовой Camera2-сессии; видеофайл не проверен."
    };
    localStorage.setItem(KEY,JSON.stringify([...current.filter(p=>p.context!==row.context||identity(p.result)!==key).slice(-(LIMIT-1)),{...row,result:clean}]));
    return true;
  } catch { return false; }
}
