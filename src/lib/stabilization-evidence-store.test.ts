import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {loadStabilizationEvidence,saveStabilizationEvidence} from "./stabilization-evidence-store";
import type {StabilizationProbeResult} from "./stabilization-probe";
const values=new Map<string,string>();
const proof:StabilizationProbeResult={cameraId:"rear",width:1280,height:720,fpsRequested:30,source:"camera2-capture-result",selected:"eis",state:"capture-result-confirmed",fpsRangeApplied:true,fpsRangeMin:15,fpsRangeMax:30,eisDeclared:true,previewDeclared:false,oisDeclared:false,framesObserved:5,confirmations:4,captureResultEis:1,recordedFileVerified:false,message:"PRIVATE"};
beforeEach(()=>{values.clear();vi.stubGlobal("localStorage",{getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v)});});
afterEach(()=>vi.unstubAllGlobals());
describe("durable native stabilization evidence",()=>{
 it("keeps successful exact-mode evidence after reopening and rejects a later failed probe",()=>{
  expect(saveStabilizationEvidence(proof,100)).toBe(true);
  expect(saveStabilizationEvidence({...proof,state:"unknown"},200)).toBe(false);
  expect(loadStabilizationEvidence()).toHaveLength(1);
  expect(loadStabilizationEvidence()[0]).toMatchObject({cameraId:"rear",captureResultEis:1,recordedFileVerified:false});
  expect(JSON.stringify([...values.values()])).not.toContain("PRIVATE");
  expect(saveStabilizationEvidence({...proof,cameraId:"front"},300)).toBe(true);
  expect(loadStabilizationEvidence()).toHaveLength(2);
 });
 it("does not accept a claimed confirmation without three measured frames",()=>{
  expect(saveStabilizationEvidence({...proof,framesObserved:2},100)).toBe(false);
  expect(loadStabilizationEvidence()).toEqual([]);
 });
});
