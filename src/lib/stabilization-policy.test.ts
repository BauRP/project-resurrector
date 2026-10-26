import { describe,expect,it } from "vitest";
import { decideStabilizationForRecordedMode } from "./stabilization-policy";
import type { StabilizationProbeResult } from "./stabilization-probe";
const mode={cameraId:"0",width:1280,height:720,fps:30};
const probe:StabilizationProbeResult={cameraId:"0",width:1280,height:720,fpsRequested:30,
source:"camera2-capture-result",selected:"eis",state:"capture-result-confirmed",eisDeclared:true,
previewDeclared:false,oisDeclared:true,recordedFileVerified:false,message:"sample"};
describe("mode-specific stabilization decision",()=>{
 it("prefers EIS only for matching test-mode CaptureResult",()=>{
   expect(decideStabilizationForRecordedMode(probe,mode).recommendation).toBe("prefer-eis");
   expect(decideStabilizationForRecordedMode(probe,{...mode,fps:60}).recommendation).toBe("unknown");
   expect(decideStabilizationForRecordedMode(probe,{...mode,cameraId:"1"}).recommendation).toBe("unknown");
 });
 it("prefers OIS without blending an untested second algorithm",()=>{
   expect(decideStabilizationForRecordedMode({...probe,selected:"ois"},mode)).toMatchObject({recommendation:"prefer-ois",disableAdditionalProcessing:true});
 });
 it("only considers software when all system paths explicitly unavailable",()=>{
   expect(decideStabilizationForRecordedMode({...probe,state:"declared-unavailable",selected:"none",eisDeclared:false,oisDeclared:false,previewDeclared:false},mode).recommendation).toBe("evaluate-software");
   expect(decideStabilizationForRecordedMode({...probe,state:"not-confirmed",selected:"none"},mode).recommendation).toBe("unknown");
 });
});
