import {describe,it,expect} from "vitest";
import {auditRecordingCoverage,auditMediaCoverage} from "./initial-audit-coverage";
import type {CameraAuditCheckpoint} from "./first-run-camera-audit";
const mode={key:"rear|1280|720|30",cameraId:"rear",width:1280,height:720,fps:30,encoderName:"avc",encoderMime:"video/avc",status:"not-run",verifiedRecording:false,evidence:"declared-compatible-only"} as const;
const camera:CameraAuditCheckpoint["cameras"][string]={cameraId:"rear",source:"android-camera2-metadata",state:"metadata-collected",verifiedRecording:false,planState:"complete",planVersion:2,codecCheckedAt:10,planCodecCheckedAt:10,functionalPlan:[mode,mode],codecChecks:[{width:1280,height:720,fpsRequested:30,status:"declared-compatible",recordedAndVerified:false,encoders:[{name:"avc",mime:"video/avc",declaredOnly:true}]}]};
const passport:CameraAuditCheckpoint={schema:2,state:"complete",completed:1,total:1,advancedState:"pending",activeCameraIds:["rear"],cameras:{rear:camera}};
const row={evidenceVersion:2,captureId:1,savedAt:100,state:"saved",cameraId:"rear",width:1280,height:720,fps:30,savedBytes:100000,
 mp4TracksInspected:true,mp4HasVideoTrack:true,mp4FirstFrameDecodable:true,mp4VideoWidth:1280,mp4VideoHeight:720,mp4VideoSamples:30,
 audioRequested:false,mp4TailNearEnd:true,mp4VideoTimestampRollbacks:0,mp4VideoTimestampDuplicates:0,mp4SampledFps:30,mp4TailSampledFps:30};
const h={entries:[],maxEntries:24,omittedEarlier:50};
describe("restored practical diagnostic coverage",()=>{
 it("deduplicates the saved plan and restores recorded mode coverage from the durable archive",()=>{
  expect(auditRecordingCoverage(passport,h)).toEqual({total:1,recorded:0,unconfirmed:0});
  expect(auditRecordingCoverage(passport,{...h,modeEntries:[row]})).toEqual({total:1,recorded:1,unconfirmed:0});
 });
 it("keeps failed modes incomplete and excludes disconnected or stale plans",()=>{
  expect(auditRecordingCoverage(passport,{...h,entries:[{...row,state:"error"}]})).toEqual({total:1,recorded:0,unconfirmed:1});
  expect(auditRecordingCoverage({...passport,activeCameraIds:[]},{...h,modeEntries:[row]})).toEqual({total:0,recorded:0,unconfirmed:0});
  expect(auditRecordingCoverage({...passport,cameras:{rear:{...camera,planCodecCheckedAt:9}}},h).total).toBe(0);
 });
});

it("counts editor and export only for the same actual retained capture and mode",()=>{
 const clip={...row,diagnosticClip:true};
 const ed={captureId:1,cameraId:"rear",width:1280,height:720,fps:30,bytes:100000,decodedWidth:1280,decodedHeight:720,durationSeconds:4,checkedAt:110};
 const ex={captureId:1,cameraId:"rear",width:1280,height:720,fps:30,outputWidth:1280,outputHeight:720,outputBytes:4096,durationSeconds:2,checkedAt:120};
 const history={...h,modeEntries:[clip]};
 expect(auditMediaCoverage(passport,history,[ed],[ex])).toEqual({total:1,recorded:1,unconfirmed:0,editor:1,exported:1});
 expect(auditMediaCoverage(passport,history,[ed],[{...ex,captureId:2}]).exported).toBe(0);
 expect(auditMediaCoverage(passport,history,[{...ed,bytes:2048}],[ex]).editor).toBe(0);
 expect(auditMediaCoverage(passport,history,[ed],[{...ex,checkedAt:109}]).exported).toBe(0);
 expect(auditMediaCoverage(passport,{...h,modeEntries:[row]},[ed],[ex]).editor).toBe(0);
});
