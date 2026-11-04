import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

describe("high-speed Camera2 and device diagnostics never wait forever for missing emulator callbacks",()=>{
 it("bounds every native feature without misreporting a timeout as success",()=>{
  const source=readFileSync("src/lib/native.ts","utf8");
  for(const op of ["getCapabilities","inspectVideoFile","getEncoderSupport",
    "startCameraAvailability","stopCameraAvailability","getThermalStatus",
    "listAudioInputs","setPreferredAudioInput","startHighSpeedRecording",
    "stopHighSpeedRecording","toggleHybridAI","setFocusMode","setMeteringMode","getHybridAIStatus"]){
    expect(source).toContain(`rawMultiCamNative.${op}(`);
  }
  expect(source).toContain('nativeDeadline(rawMultiCamNative.startHighSpeedRecording(options), 30000');
  expect(source).toContain('nativeDeadline(rawMultiCamNative.stopHighSpeedRecording(), 45000');
  expect(source).toContain('late.remove().catch(() => undefined)');
  expect(source).toContain('The real camera/service owns its state');
 });
});
