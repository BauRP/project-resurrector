import type { CameraAuditCheckpoint } from "./first-run-camera-audit";
import type { NativeCaptureStatus } from "./native-capture";
import { nativeRecordedModeEvidence } from "./native-recorded-mode-evidence";
import type { NativeAuditHistory } from "./native-audit-report";

export interface InitialAuditRecordingObservation {
  cameraId:string; width:number; height:number; fps:number;
  state:"recorded"|"interrupted-or-unconfirmed";
  bytes:number|null;
  source:"native-finalized-recording";
  /** The plan names a MediaCodec candidate, but MediaRecorder may select
   * another encoder. Ordinary recording does NOT prove that exact encoder. */
  exactEncoderVerified:false;
  fullPipelineVerified:false;
}
const key=(id:string,w:number,h:number,fps:number)=>JSON.stringify([id,w,h,fps]);
const positiveInt=(n:unknown):n is number=>typeof n==="number"&&Number.isSafeInteger(n)&&n>0;
export function matchInitialAuditRecordings(
  passport:CameraAuditCheckpoint|null|undefined, history:NativeAuditHistory|null|undefined,
):InitialAuditRecordingObservation[]{
  if(!passport||!Array.isArray(history?.entries))return [];
  const candidates=new Set<string>();
  for(const [id,camera] of Object.entries(passport.cameras??{}).slice(0,64)){
    if(!id||!camera||camera.cameraId!==id||camera.planState!=="complete"||
       camera.planVersion!==2||camera.planCodecCheckedAt!==camera.codecCheckedAt||
       !positiveInt(camera.codecCheckedAt)||!Array.isArray(camera.functionalPlan))continue;
    for(const mode of camera.functionalPlan.slice(0,8)){
      if(!mode||mode.cameraId!==id||mode.evidence!=="declared-compatible-only"||
         mode.status!=="not-run"||mode.verifiedRecording!==false||
         !positiveInt(mode.width)||!positiveInt(mode.height)||!positiveInt(mode.fps))continue;
      candidates.add(key(id,mode.width,mode.height,mode.fps));
    }
  }
  const result=new Map<string,InitialAuditRecordingObservation>();
  // The journal is chronological. Prefer a genuine earlier recording to a
  // subsequent failed attempt, but retain the latest successful observation.
  for(const row of history.entries.slice(-24)){
    if(!row||typeof row!=="object"||Array.isArray(row)||
       typeof row.cameraId!=="string"||!positiveInt(row.width)||
       !positiveInt(row.height)||!positiveInt(row.fps)||
       !positiveInt(row.captureId)||!positiveInt(row.savedAt))continue;
    const id=key(row.cameraId,row.width,row.height,row.fps);
    if(!candidates.has(id))continue;
    if(!["saved","saved_interrupted","interrupted","error"].includes(typeof row.state==="string"?row.state:""))continue;
    // Older history lacks complete timing fields; it cannot silently be
    // reclassified as a new, valid recording. No additional camera is opened.
    const complete=row.evidenceVersion===2&&row.mp4TracksInspected===true&&
      typeof row.audioRequested==="boolean"&&typeof row.mp4TailNearEnd==="boolean"&&
      typeof row.mp4VideoTimestampRollbacks==="number"&&typeof row.mp4VideoTimestampDuplicates==="number"&&
      typeof row.mp4SampledFps==="number"&&typeof row.mp4TailSampledFps==="number";
    const evidence=complete?nativeRecordedModeEvidence(row as unknown as NativeCaptureStatus,row.savedAt):null;
    const recorded=evidence?.state==="recorded";
    if(!recorded&&result.get(id)?.state==="recorded")continue;
    result.set(id,{cameraId:row.cameraId,width:row.width,height:row.height,fps:row.fps,
      state:recorded?"recorded":"interrupted-or-unconfirmed",bytes:positiveInt(row.savedBytes)?row.savedBytes:null,
      source:"native-finalized-recording",exactEncoderVerified:false,fullPipelineVerified:false});
  }
  return [...result.values()];
}
