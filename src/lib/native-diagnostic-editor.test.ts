// @vitest-environment jsdom
import {describe,it,expect,vi,beforeEach} from "vitest";
import {eligibleDiagnosticEditorClip,validDiagnosticEditorSource,importDiagnosticEditorClip,readDiagnosticEditorObservations} from "./native-diagnostic-editor";
import type {NativeCaptureStatus} from "./native-capture";
import type {RecordedClip} from "./clip-persistence";
const status:NativeCaptureStatus={state:"saved",message:"",startedAt:1,captureId:7,diagnosticClip:true,captureServiceActive:false,stabilization:"unknown",stabilizationCaptureResultObserved:false,savedBytes:2048,savedUri:"",videoOnly:true,cameraId:"rear",width:1280,height:720,fps:30,mp4TracksInspected:true,mp4HasVideoTrack:true,mp4FirstFrameDecodable:true,mp4VideoWidth:1280,mp4VideoHeight:720,mp4VideoSamples:60,audioRequested:false};
const source={captureId:7,path:"/data/user/0/app/files/native-video/test.mp4",bytes:2048};
beforeEach(()=>localStorage.clear());
describe("actual diagnostic recording to editor media storage",()=>{
 it("rejects active, ordinary, mismatched and oversized files",()=>{
  expect(eligibleDiagnosticEditorClip(status)).toBe(true);
  expect(eligibleDiagnosticEditorClip({...status,captureServiceActive:true})).toBe(false);
  expect(eligibleDiagnosticEditorClip({...status,diagnosticClip:false})).toBe(false);
  expect(validDiagnosticEditorSource(status,{...source,captureId:8})).toBe(false);
  expect(validDiagnosticEditorSource(status,{...source,path:"/data/files/../native-video/test.mp4"})).toBe(false);
  expect(eligibleDiagnosticEditorClip({...status,savedBytes:33*1024*1024})).toBe(false);
 });
 it("reads the stored original, decodes its frame and persists only actual observations",async()=>{
  let stored:RecordedClip|undefined;
  const blob=new Blob([new Uint8Array(2048)],{type:"video/mp4"});
  const decode=vi.fn(async()=>({width:1280,height:720,durationSeconds:2,verifiedFirstFrame:true as const,source:"html-video-loadeddata" as const}));
  const row=await importDiagnosticEditorClip(status,new AbortController().signal,{
   source:async()=>source,load:async()=>blob,
   save:async clip=>{stored=clip;},read:async()=>stored!,decode,
  });
  expect(stored?.id).toBe("native-diagnostic-7");
  expect(decode).toHaveBeenCalledWith(stored?.blob,expect.anything());
  expect(readDiagnosticEditorObservations()).toEqual([row]);
 });
 it("does not certify changed stored data or a cancelled operation",async()=>{
  const blob=new Blob([new Uint8Array(2048)],{type:"video/mp4"});
  const altered=new Blob([new Uint8Array(2048).fill(1)],{type:"video/mp4"});
  let stored:RecordedClip|undefined;
  const decode=vi.fn(async()=>({width:1280,height:720,durationSeconds:2,verifiedFirstFrame:true as const,source:"html-video-loadeddata" as const}));
  const deps={source:async()=>source,load:async()=>blob,save:async(clip:RecordedClip)=>{stored=clip;},read:async()=>({...stored!,blob:altered}),decode};
  await expect(importDiagnosticEditorClip(status,new AbortController().signal,deps)).rejects.toThrow("байты");
  expect(decode).not.toHaveBeenCalled();
  const c=new AbortController();c.abort();
  await expect(importDiagnosticEditorClip(status,c.signal,deps)).rejects.toThrow("отменена");
  expect(readDiagnosticEditorObservations()).toEqual([]);
 });
});
