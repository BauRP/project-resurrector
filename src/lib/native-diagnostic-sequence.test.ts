import {describe,it,expect,vi} from "vitest";
import {diagnosticClipDisposition,waitForDiagnosticClip,validDiagnosticMode} from "./native-diagnostic-sequence";
import type {NativeCaptureStatus} from "./native-capture";
const mode={cameraId:"rear",size:"1280x720",fps:30,recorded:false};
const make=(extra:Partial<NativeCaptureStatus>={}):NativeCaptureStatus=>({state:"saved",message:"",startedAt:1,captureId:11,stabilization:"unknown",stabilizationCaptureResultObserved:false,savedBytes:0,savedUri:"",videoOnly:true,cameraId:"rear",width:1280,height:720,fps:30,diagnosticClip:true,captureServiceActive:false,...extra});
describe("diagnostic video sequence",()=>{
 it("waits for the new exact recording and complete service shutdown",()=>{
  expect(diagnosticClipDisposition(make({captureId:10}),10,mode)).toBe("wait");
  expect(diagnosticClipDisposition(make({captureServiceActive:true}),10,mode)).toBe("wait");
  expect(diagnosticClipDisposition(make({diagnosticClip:false}),10,mode)).toBe("foreign");
  expect(diagnosticClipDisposition(make({captureId:12}),10,mode,11)).toBe("foreign");
  expect(diagnosticClipDisposition(make({state:"saved_interrupted"}),10,mode)).toBe("failed");
  expect(diagnosticClipDisposition(make(),10,mode)).toBe("finished");
 });
 it("rejects invalid recorder modes and never trusts an old journal entry",async()=>{
  expect(validDiagnosticMode(mode)).toBe(true);
  expect(validDiagnosticMode({...mode,size:"99999x720"})).toBe(false);
  const history=vi.fn(async()=>({entries:[{captureId:10}],omittedEarlier:0,maxEntries:24}));
  const result=await waitForDiagnosticClip({previousId:10,mode,initial:make(),status:async()=>make(),history,sleep:async()=>{},now:()=>0,continue:()=>true,onStatus:()=>{}});
  expect(result).toBe("failed");expect(history).toHaveBeenCalledTimes(1);
 });
 it("does not query again after cancellation and bounds unresolved start",async()=>{
  let alive=true,clock=0;
  const status=vi.fn(async()=>make({captureId:10}));
  const base={previousId:10,mode,initial:make({captureId:10}),status,history:async()=>({entries:[],omittedEarlier:0,maxEntries:24}),now:()=>clock,continue:()=>alive,onStatus:()=>{}};
  expect(await waitForDiagnosticClip({...base,sleep:async()=>{alive=false;}})).toBe("cancelled");
  expect(status).not.toHaveBeenCalled();
  alive=true;
  expect(await waitForDiagnosticClip({...base,sleep:async()=>{clock+=1500;}})).toBe("unknown");
  expect(status.mock.calls.length).toBeLessThan(31);
 });
});
