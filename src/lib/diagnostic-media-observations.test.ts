import {afterEach,describe,expect,it,vi} from "vitest";
import {
 EDITOR_OBSERVATION_KEY,EXPORT_OBSERVATION_KEY,
 readDiagnosticEditorObservations,readDiagnosticExportObservations,diagnosticExportCandidate,
 type DiagnosticEditorObservation,type DiagnosticExportObservation,
} from "./diagnostic-media-observations";
const editor=(overrides:Partial<DiagnosticEditorObservation>={}):DiagnosticEditorObservation=>({
 captureId:7,cameraId:"rear",width:1920,height:1080,fps:30,bytes:120000,
 decodedWidth:1920,decodedHeight:1080,durationSeconds:4,checkedAt:100,...overrides,
});
const exported=(overrides:Partial<DiagnosticExportObservation>={}):DiagnosticExportObservation=>({
 captureId:7,cameraId:"rear",width:1920,height:1080,fps:30,
 outputWidth:1280,outputHeight:720,outputBytes:64000,durationSeconds:2,checkedAt:110,...overrides,
});
function installStorage(rows:Record<string,unknown[]>){
 const values=new Map(Object.entries(rows).map(([key,value])=>[key,JSON.stringify(value)]));
 vi.stubGlobal("localStorage",{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)});
}
afterEach(()=>vi.unstubAllGlobals());
describe("diagnostic observation history integrity",()=>{
 it("counts a repeated editor capture ID once and keeps its newest matching row",()=>{
  installStorage({[EDITOR_OBSERVATION_KEY]:[editor(),editor({checkedAt:120}),editor({captureId:8,checkedAt:130})]});
  expect(readDiagnosticEditorObservations()).toEqual([editor({checkedAt:120}),editor({captureId:8,checkedAt:130})]);
 });
 it("discards a capture ID reused for a different camera or mode",()=>{
  installStorage({[EDITOR_OBSERVATION_KEY]:[editor(),editor({checkedAt:120,cameraId:"front"}),editor({checkedAt:140})]});
  expect(readDiagnosticEditorObservations()).toEqual([]);
 });
 it("does not count duplicate exports as additional coverage",()=>{
  installStorage({[EXPORT_OBSERVATION_KEY]:[exported(),exported({checkedAt:130})]});
  expect(readDiagnosticExportObservations()).toEqual([exported({checkedAt:130})]);
 });
 it("selects the latest valid editor observation for a saved capture",()=>{
  installStorage({[EDITOR_OBSERVATION_KEY]:[editor({checkedAt:120}),editor({checkedAt:140,durationSeconds:12}),editor({checkedAt:130})]});
  expect(diagnosticExportCandidate(7)).toEqual(editor({checkedAt:130}));
  expect(diagnosticExportCandidate(999)).toBeNull();
 });
 it("ignores malformed records and invalid capture IDs",()=>{
  installStorage({[EDITOR_OBSERVATION_KEY]:[null,{},editor({captureId:0}),editor({captureId:9}),editor({captureId:9,checkedAt:160})]});
  expect(readDiagnosticEditorObservations()).toEqual([editor({captureId:9,checkedAt:160})]);
 });
});
