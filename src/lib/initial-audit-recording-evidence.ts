import type { CameraAuditCheckpoint } from "./first-run-camera-audit";
import type { NativeCaptureStatus } from "./native-capture";
import { nativeRecordedModeEvidence } from "./native-recorded-mode-evidence";
import type { NativeAuditHistory } from "./native-audit-report";
import type { NativeCameraProfile } from "./native";
import { nativeFpsCandidates } from "./native-mode-selection";

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
  const archived=Array.isArray(history.modeEntries)?history.modeEntries.slice(-128):[];
  for(const row of [...archived,...history.entries.slice(-24)]){
    if(!row||typeof row!=="object"||Array.isArray(row)||
       typeof row["cameraId"]!=="string"||!positiveInt(row["width"])||
       !positiveInt(row["height"])||!positiveInt(row["fps"])||
       !positiveInt(row["captureId"])||!positiveInt(row["savedAt"]))continue;
    const id=key(row["cameraId"],row["width"],row["height"],row["fps"]);
    if(!candidates.has(id))continue;
    if(!["saved","saved_interrupted","interrupted","error"].includes(typeof row["state"]==="string"?row["state"]:""))continue;
    // Older history lacks complete timing fields; it cannot silently be
    // reclassified as a new, valid recording. No additional camera is opened.
    const complete=row["evidenceVersion"]===2&&row["mp4TracksInspected"]===true&&
      typeof row["audioRequested"]==="boolean"&&typeof row["mp4TailNearEnd"]==="boolean"&&
      typeof row["mp4VideoTimestampRollbacks"]==="number"&&typeof row["mp4VideoTimestampDuplicates"]==="number"&&
      typeof row["mp4SampledFps"]==="number"&&typeof row["mp4TailSampledFps"]==="number";
    const evidence=complete?nativeRecordedModeEvidence(row as unknown as NativeCaptureStatus,row["savedAt"]):null;
    const recorded=evidence?.state==="recorded";
    if(!recorded&&result.get(id)?.state==="recorded")continue;
    result.set(id,{cameraId:row["cameraId"],width:row["width"],height:row["height"],fps:row["fps"],
      state:recorded?"recorded":"interrupted-or-unconfirmed",bytes:positiveInt(row["savedBytes"])?row["savedBytes"]:null,
      source:"native-finalized-recording",exactEncoderVerified:false,fullPipelineVerified:false});
  }
  return [...result.values()];
}

/** Bridge the saved plan to the existing real AVC recording controls.
 * Never change the active recording, never run a second camera, never
 * treat a planned HEVC/high-speed mode as an ordinary AVC candidate. */
export interface InitialAuditMode {
  cameraId:string;size:string;fps:number;recorded:boolean;
}
export function initialAuditRecordingModes(
  passport:CameraAuditCheckpoint|null|undefined,
  history:NativeAuditHistory,
  profiles:readonly NativeCameraProfile[],
  preferredCameraId:string,
):InitialAuditMode[] {
  if(!passport||passport.schema!==2||!Array.isArray(passport.activeCameraIds))return [];
  const result:InitialAuditMode[]=[];
  const seen=new Set<string>();
  const confirmed=new Set(matchInitialAuditRecordings(passport,history)
    .filter(row=>row.state==="recorded").map(row=>key(row.cameraId,row.width,row.height,row.fps)));
  const ids=[preferredCameraId,...passport.activeCameraIds].filter((id,i,all)=>
    typeof id==="string"&&!!id&&passport.activeCameraIds!.includes(id)&&all.indexOf(id)===i).slice(0,64);
  for(const id of ids){
    const profile=profiles.find(c=>c.cameraId===id);
    const camera=passport.cameras?.[id];
    if(!profile||!camera||camera.cameraId!==id||camera.state!=="metadata-collected"||
      camera.planState!=="complete"||camera.planVersion!==2||
      !positiveInt(camera.codecCheckedAt)||camera.planCodecCheckedAt!==camera.codecCheckedAt||
      !Array.isArray(camera.functionalPlan)||!Array.isArray(camera.codecChecks))continue;
    for(const mode of camera.functionalPlan.slice(0,8)){
      if(!mode||mode.cameraId!==id||mode.status!=="not-run"||mode.verifiedRecording!==false||
        mode.evidence!=="declared-compatible-only"||!positiveInt(mode.width)||!positiveInt(mode.height)||
        ![24,25,30,60].includes(mode.fps))continue;
      const size=mode.width+"x"+mode.height;
      if(!nativeFpsCandidates(profile,size).includes(mode.fps))continue;
      // The normal recorder uses AVC even if the plan ranked a HEVC
      // encoder first. Demand an explicit matching AVC declaration.
      const avc=camera.codecChecks.some(check=>check&&check.width===mode.width&&
        check.height===mode.height&&check.fpsRequested===mode.fps&&
        check.status==="declared-compatible"&&Array.isArray(check.encoders)&&
        check.encoders.some(encoder=>encoder&&encoder.mime==="video/avc"&&encoder.declaredOnly===true));
      const modeKey=key(id,mode.width,mode.height,mode.fps);
      if(avc&&!seen.has(modeKey)){
        seen.add(modeKey);
        result.push({cameraId:id,size,fps:mode.fps,recorded:confirmed.has(modeKey)});
      }
    }
  }
  return orderInitialAuditModes(result,matchInitialAuditRecordings(passport,history));
}

/** Prioritize untried modes over unsuccessful ones, without marking a failure
 * as completed. The user can retry those modes after other lenses. */
export function orderInitialAuditModes(modes:readonly InitialAuditMode[],observations:readonly InitialAuditRecordingObservation[]):InitialAuditMode[]{
 const failed=new Set(observations.filter(o=>o.state==="interrupted-or-unconfirmed")
   .map(o=>JSON.stringify([o.cameraId,o.width+"x"+o.height,o.fps])));
 const rank=(m:InitialAuditMode)=>m.recorded?2:failed.has(JSON.stringify([m.cameraId,m.size,m.fps]))?1:0;
 return [...modes].sort((a,b)=>rank(a)-rank(b));
}

export function nextInitialAuditRecordingMode(
  passport:CameraAuditCheckpoint|null|undefined,history:NativeAuditHistory,
  profiles:readonly NativeCameraProfile[],preferredCameraId:string,
):{cameraId:string;size:string;fps:number}|null {
  const next=initialAuditRecordingModes(passport,history,profiles,preferredCameraId).find(m=>!m.recorded);
  return next?{cameraId:next.cameraId,size:next.size,fps:next.fps}:null;
}
