import {describe,it,expect,vi} from "vitest";
import {runDiagnosticPipeline} from "./native-diagnostic-pipeline";
import type {NativeCaptureStatus} from "./native-capture";
const status:NativeCaptureStatus={state:"saved",message:"",startedAt:1,captureId:7,diagnosticClip:true,captureServiceActive:false,stabilization:"unknown",stabilizationCaptureResultObserved:false,savedBytes:2048,savedUri:"",videoOnly:true,cameraId:"rear",width:1280,height:720,fps:30};
const row={captureId:7,cameraId:"rear",width:1280,height:720,fps:30,bytes:2048,decodedWidth:1280,decodedHeight:720,durationSeconds:4,checkedAt:1};
const result={captureId:7,cameraId:"rear",width:1280,height:720,fps:30,outputWidth:1280,outputHeight:720,outputBytes:4096,durationSeconds:2,checkedAt:2};
const deps=()=>({importClip:vi.fn(async()=>row),render:vi.fn(async()=>result),canContinue:vi.fn(async()=>true)});
describe("one authorized diagnostic media chain",()=>{
 it("imports and renders the same finalized capture in order",async()=>{
  const d=deps(),stage=vi.fn();
  expect(await runDiagnosticPipeline(status,new AbortController().signal,stage,d)).toEqual(result);
  expect(d.importClip).toHaveBeenCalledTimes(1);expect(d.render).toHaveBeenCalledWith(row,expect.anything(),expect.anything());
  expect(d.canContinue).toHaveBeenCalledTimes(2);
  expect(stage.mock.calls).toEqual([["editor",0],["editor",100],["export",0],["export",100]]);
 });
 it("does not render after a changed capture, resource loss or cancellation",async()=>{
  const d=deps(),signal=new AbortController();
  d.importClip.mockResolvedValueOnce({...row,captureId:8});
  await expect(runDiagnosticPipeline(status,signal.signal,()=>{},d)).rejects.toThrow("другой");
  d.canContinue.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await expect(runDiagnosticPipeline(status,signal.signal,()=>{},d)).rejects.toThrow("отложена");
  signal.abort();
  await expect(runDiagnosticPipeline(status,signal.signal,()=>{},d)).rejects.toThrow("остановлена");
  expect(d.render).not.toHaveBeenCalled();
 });
});
