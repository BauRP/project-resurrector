import {describe,it,expect} from "vitest";
import {nextInitialAuditRecordingMode,matchInitialAuditRecordings} from "./initial-audit-recording-evidence";
import type {CameraAuditCheckpoint} from "./first-run-camera-audit";
const passport:CameraAuditCheckpoint={schema:2,state:"complete",completed:1,total:1,advancedState:"pending",cameras:{
 rear:{cameraId:"rear",source:"android-camera2-metadata",state:"metadata-collected",verifiedRecording:false,codecCheckedAt:10,planCodecCheckedAt:10,planState:"complete",planVersion:2,
 functionalPlan:[{cameraId:"rear",key:"rear|1920|1080|30",width:1920,height:1080,fps:30,encoderName:"candidate",encoderMime:"video/avc",status:"not-run",verifiedRecording:false,evidence:"declared-compatible-only"}]}
}};
const row={evidenceVersion:2,captureId:1,savedAt:100,state:"saved",cameraId:"rear",width:1920,height:1080,fps:30,savedBytes:100000,
 mp4TracksInspected:true,mp4HasVideoTrack:true,mp4FirstFrameDecodable:true,mp4VideoWidth:1920,mp4VideoHeight:1080,mp4VideoSamples:30,
 audioRequested:false,mp4TailNearEnd:true,mp4VideoTimestampRollbacks:0,mp4VideoTimestampDuplicates:0,mp4SampledFps:30,mp4TailSampledFps:30};
const match=(entries:Array<Record<string,unknown>>)=>matchInitialAuditRecordings(passport,{entries,maxEntries:24,omittedEarlier:0});
describe("reuse ordinary native recording evidence without another capture",()=>{
 it("matches only the exact camera and mode and does not certify the encoder or entire pipeline",()=>{
  expect(match([row,{...row,cameraId:"front"},{...row,fps:60}])).toEqual([{cameraId:"rear",width:1920,height:1080,fps:30,state:"recorded",bytes:100000,source:"native-finalized-recording",exactEncoderVerified:false,fullPipelineVerified:false}]);
 });
 it("retains genuine evidence after a failed attempt, and treats older or corrupt history as unconfirmed",()=>{
  expect(match([row,{...row,captureId:2,state:"saved_interrupted"}])[0]?.state).toBe("recorded");
  expect(match([{...row,evidenceVersion:1}])[0]?.state).toBe("interrupted-or-unconfirmed");
  expect(match([{...row,mp4VideoTimestampDuplicates:2}])[0]?.state).toBe("interrupted-or-unconfirmed");
 });
 it("does not match a stale candidate plan after a codec inventory change",()=>{
  const stale={...passport,cameras:{rear:{...passport.cameras.rear!,codecCheckedAt:11}}};
  expect(matchInitialAuditRecordings(stale,{entries:[row],maxEntries:24,omittedEarlier:0})).toEqual([]);
 });
});

describe("prepare the next real native diagnostic recording",()=>{
 const profile={cameraId:"rear",sizes:["1920x1080","1280x720"],fpsRanges:["24-60"],videoOutputSizes:[
 {width:1920,height:1080,theoreticalMaxFps:30},{width:1280,height:720,theoreticalMaxFps:60}]} as import("./native").NativeCameraProfile;
 const c=passport.cameras.rear!;
 const plan={...passport,activeCameraIds:["rear"],cameras:{rear:{...c,
   functionalPlan:[...c.functionalPlan!,{...c.functionalPlan![0]!,width:1280,height:720,fps:60}],
   codecChecks:[{width:1920,height:1080,fpsRequested:30,status:"declared-compatible" as const,recordedAndVerified:false as const,encoders:[{name:"avc",mime:"video/avc",declaredOnly:true as const}]},
   {width:1280,height:720,fpsRequested:60,status:"declared-compatible" as const,recordedAndVerified:false as const,encoders:[{name:"avc",mime:"video/avc",declaredOnly:true as const}]}]}}};
 it("uses the saved first mode, then skips an already confirmed sample",()=>{
  expect(nextInitialAuditRecordingMode(plan,{entries:[],omittedEarlier:0,maxEntries:24},[profile],"rear")).toEqual({cameraId:"rear",size:"1920x1080",fps:30});
  expect(nextInitialAuditRecordingMode(plan,{entries:[row],omittedEarlier:0,maxEntries:24},[profile],"rear")).toEqual({cameraId:"rear",size:"1280x720",fps:60});
 });
 it("refuses stale, disconnected or non-AVC candidates",()=>{
  const h={entries:[],omittedEarlier:0,maxEntries:24};
  expect(nextInitialAuditRecordingMode(plan,h,[],"rear")).toBeNull();
  expect(nextInitialAuditRecordingMode({...plan,activeCameraIds:[]},h,[profile],"rear")).toBeNull();
  expect(nextInitialAuditRecordingMode({...plan,cameras:{rear:{...plan.cameras.rear,codecChecks:[]}}},h,[profile],"rear")).toBeNull();
 });
});

describe("durable practical diagnostic progress",()=>{
 it("uses archived mode evidence even after the recent capture history rotates",()=>{
  expect(matchInitialAuditRecordings(passport,{entries:[],modeEntries:[row],maxEntries:24,omittedEarlier:80})[0]?.state).toBe("recorded");
  expect(matchInitialAuditRecordings(passport,{entries:[],modeEntries:[{...row,state:"error"}],maxEntries:24,omittedEarlier:80})[0]?.state).toBe("interrupted-or-unconfirmed");
 });
});
