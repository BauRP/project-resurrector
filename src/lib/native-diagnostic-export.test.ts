// @vitest-environment jsdom
import {beforeEach,describe,it,expect,vi} from "vitest";
import {runDiagnosticExport,diagnosticExportPlan,readDiagnosticExportObservations} from "./native-diagnostic-export";
import type {DiagnosticEditorObservation} from "./native-diagnostic-editor";
import type {RecordedClip} from "./clip-persistence";
const row:DiagnosticEditorObservation={captureId:7,cameraId:"rear",width:1280,height:720,fps:30,bytes:2048,decodedWidth:1280,decodedHeight:720,durationSeconds:4,checkedAt:1};
const source:RecordedClip={id:"native-diagnostic-7",createdAt:1,camera:1,cameraDeviceId:"rear",mode:"diagnostic",profile:"Camera2",playbackRate:1,blob:new Blob([new Uint8Array(2048)],{type:"video/mp4"})};
const webm=new Blob([new Uint8Array(4096)],{type:"video/webm"});
beforeEach(()=>localStorage.clear());
function deps(){
 let output:RecordedClip|undefined;
 return {read:vi.fn(async(id:string)=>id===source.id?source:output!),save:vi.fn(async(clip:RecordedClip)=>{output=clip;}),render:vi.fn(async()=>({blob:webm,filename:"actual.webm"})),decode:vi.fn(async()=>({width:1280,height:720,durationSeconds:2,verifiedFirstFrame:true as const,source:"html-video-loadeddata" as const}))};
}
describe("diagnostic export through the real NLE render contract",()=>{
 it("uses a bounded trim, persists and reopens encoded WebM before reporting success",async()=>{
  const d=deps(),progress=vi.fn();
  const proof=await runDiagnosticExport(row,new AbortController().signal,progress,d);
  expect(diagnosticExportPlan(row).duration).toBe(2);
  expect(d.render).toHaveBeenCalledTimes(1);
  expect(d.save.mock.calls[0]?.[0].id).not.toBe(source.id);
  expect(d.read).toHaveBeenCalledTimes(2);
  expect(d.decode).toHaveBeenCalledWith(webm,expect.anything());
  expect(readDiagnosticExportObservations()).toEqual([proof]);
  expect(progress).toHaveBeenLastCalledWith(100);
 });
 it("rejects missing input, invalid decoded output and cancellation without certifying export",async()=>{
  const d=deps();
  await expect(runDiagnosticExport({...row,bytes:1},new AbortController().signal,()=>{},d)).rejects.toThrow("изменён");
  expect(d.render).not.toHaveBeenCalled();
  d.decode.mockResolvedValueOnce({width:640,height:360,durationSeconds:2,verifiedFirstFrame:true,source:"html-video-loadeddata"});
  await expect(runDiagnosticExport(row,new AbortController().signal,()=>{},d)).rejects.toThrow("Размер");
  const c=new AbortController();c.abort();
  await expect(runDiagnosticExport(row,c.signal,()=>{},d)).rejects.toThrow("отменён");
  expect(readDiagnosticExportObservations()).toEqual([]);
 });
});
