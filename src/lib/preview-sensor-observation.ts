import type { StabilizationProbeResult } from "./stabilization-probe";
import { decideStabilizationForRecordedMode } from "./stabilization-policy";

/** Snapshot of one actual matching CaptureResult. Not a manual-control range,
 * autofocus speed, recording, or successful exposure adjustment. */
export function previewSensorObservation(result:StabilizationProbeResult):NonNullable<StabilizationProbeResult["sensorObservation"]>|undefined {
 if(decideStabilizationForRecordedMode(result,{cameraId:result.cameraId,width:result.width,height:result.height,fps:result.fpsRequested}).systemState!=="test-confirmed")return undefined;
 const s=result.sensorObservation;
 if(!s||typeof s!=="object"||Array.isArray(s))return undefined;
 const out:NonNullable<StabilizationProbeResult["sensorObservation"]>={};
 const integer=(v:unknown,min:number,max:number):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
 if(integer(s.iso,1,10000000))out.iso=s.iso;
 if(integer(s.exposureNs,1,60000000000))out.exposureNs=s.exposureNs;
 if(typeof s.focusDiopters==="number"&&Number.isFinite(s.focusDiopters)&&s.focusDiopters>=0)out.focusDiopters=s.focusDiopters;
 if(integer(s.afState,0,6))out.afState=s.afState;
 if(integer(s.aeState,0,5))out.aeState=s.aeState;
 if(integer(s.awbState,0,3))out.awbState=s.awbState;
 return Object.keys(out).length?out:undefined;
}
