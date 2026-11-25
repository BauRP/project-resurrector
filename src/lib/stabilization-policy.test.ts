import { describe,expect,it } from "vitest";
import { decideStabilizationForRecordedMode } from "./stabilization-policy";
import type { StabilizationProbeResult } from "./stabilization-probe";
const mode={cameraId:"0",width:1280,height:720,fps:30};
const probe:StabilizationProbeResult={cameraId:"0",width:1280,height:720,fpsRequested:30,
source:"camera2-capture-result",selected:"eis",state:"capture-result-confirmed",eisDeclared:true,
previewDeclared:false,oisDeclared:true,recordedFileVerified:false,message:"sample",
framesObserved:5,confirmations:3,captureResultEis:1,captureResultOis:0};
describe("mode-specific stabilization decision",()=>{
 it("prefers EIS only for matching test-mode CaptureResult",()=>{
   expect(decideStabilizationForRecordedMode(probe,mode).recommendation).toBe("prefer-eis");
   expect(decideStabilizationForRecordedMode(probe,{...mode,fps:60}).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode(probe,{...mode,cameraId:"1"}).recommendation).toBe("unknown");
 });
 it("ignores malformed or contradictory Camera2 confirmation counts",()=>{
   expect(decideStabilizationForRecordedMode({...probe,framesObserved:0},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,framesObserved:3,confirmations:0},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,confirmations:NaN},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,framesObserved:7,confirmations:3},mode).recommendation).toBe("prefer-eis");
   const missingFrames = {...probe};
   delete missingFrames.framesObserved;
   const missingConfirmations = {...probe};
   delete missingConfirmations.confirmations;
   expect(decideStabilizationForRecordedMode(missingFrames,mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode(missingConfirmations,mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,framesObserved:2,confirmations:3},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,framesObserved:5,confirmations:2},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,captureResultEis:0},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,eisDeclared:false},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,selected:"preview-stabilization",previewDeclared:true,captureResultEis:2},mode).recommendation).toBe("prefer-eis");
   expect(decideStabilizationForRecordedMode({...probe,selected:"preview-stabilization",previewDeclared:true,captureResultEis:1},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,source:"untrusted" as "camera2-capture-result"},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode(probe,{...mode,fps:Infinity}).recommendation).toBe("unknown");
 });
 it("prefers OIS without blending an untested second algorithm",()=>{
   expect(decideStabilizationForRecordedMode({...probe,selected:"ois",captureResultOis:1},mode)).toMatchObject({recommendation:"prefer-ois",disableAdditionalProcessing:true});
   expect(decideStabilizationForRecordedMode({...probe,selected:"ois",captureResultOis:0},mode).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode({...probe,selected:"ois",oisDeclared:false,captureResultOis:1},mode).recommendation).toBe("unknown");
 });
 it("only considers software when all system paths explicitly unavailable",()=>{
   expect(decideStabilizationForRecordedMode({...probe,state:"declared-unavailable",selected:"none",eisDeclared:false,oisDeclared:false,previewDeclared:false},mode).recommendation).toBe("evaluate-software");
   expect(decideStabilizationForRecordedMode({...probe,state:"not-confirmed",selected:"none"},mode).recommendation).toBe("unknown");
 });
});

describe("untrusted stabilization bridge data", () => {
  it("does not promote malformed or contradictory declarations to verified evidence", () => {
    const invalidBoolean = {...probe,eisDeclared:"false"} as unknown as StabilizationProbeResult;
    const falseFileProof = {...probe,recordedFileVerified:true} as unknown as StabilizationProbeResult;
    expect(decideStabilizationForRecordedMode(invalidBoolean,mode).recommendation).toBe("unknown");
    expect(decideStabilizationForRecordedMode(falseFileProof,mode).recommendation).toBe("unknown");
    expect(decideStabilizationForRecordedMode({...probe,state:"declared-unavailable",selected:"eis",eisDeclared:false,oisDeclared:false,previewDeclared:false},mode).recommendation).toBe("unknown");
  });
});
