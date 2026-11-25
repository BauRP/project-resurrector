import {describe,it,expect} from "vitest";
import {previewSensorObservation,previewSensorSampleFps} from "./preview-sensor-observation";
import type {StabilizationProbeResult} from "./stabilization-probe";
const proof:StabilizationProbeResult={cameraId:"rear",width:1280,height:720,fpsRequested:30,source:"camera2-capture-result",selected:"eis",state:"capture-result-confirmed",eisDeclared:true,oisDeclared:false,previewDeclared:false,recordedFileVerified:false,message:"",framesObserved:3,confirmations:3,captureResultEis:1,fpsRangeApplied:true,fpsRangeMin:15,fpsRangeMax:30,sensorObservation:{iso:200,exposureNs:10000000,focusDiopters:0,afState:2,aeState:2,awbState:2}};
describe("actual Camera2 preview sensor metadata",()=>{
 it("keeps measured valid values including infinity focus and filters extra fields",()=>{
  const s={...proof.sensorObservation,secret:"private",iso:200,focusDiopters:0};
  expect(previewSensorObservation({...proof,sensorObservation:s})).toEqual(proof.sensorObservation);
 });
 it("does not infer readings from a declaration or malformed result",()=>{
  expect(previewSensorObservation({...proof,fpsRangeApplied:false})).toBeUndefined();
  expect(previewSensorObservation({...proof,sensorObservation:{iso:NaN,exposureNs:-1,focusDiopters:Infinity,afState:9,aeState:99,awbState:-1}})).toBeUndefined();
 });
});

it("calculates sampled sensor FPS only from valid consecutive-frame timing",()=>{
 const timing={...proof,sensorObservation:{sensorIntervals:2,sensorSpanNs:66666667,frameDurationNs:33333333}};
 expect(previewSensorSampleFps(timing)).toBe(30);
 expect(previewSensorSampleFps({...timing,sensorObservation:{sensorIntervals:1,sensorSpanNs:33333333}})).toBeNull();
 expect(previewSensorSampleFps({...timing,sensorObservation:{sensorIntervals:2,sensorSpanNs:0}})).toBeNull();
 expect(previewSensorSampleFps({...timing,sensorObservation:{sensorIntervals:2,sensorSpanNs:1}})).toBeNull();
 expect(previewSensorSampleFps({...timing,fpsRangeApplied:false})).toBeNull();
});
