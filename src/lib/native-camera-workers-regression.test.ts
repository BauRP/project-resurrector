import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("Camera2 binder-heavy operations do not occupy the shared Capacitor worker",()=>{
 it("dispatches high-speed recorder start/stop and Bluetooth routing off the plugin callback",()=>{
  const code=readFileSync("android/app/src/main/java/app/lovable/multicampov/MultiCamNativePlugin.java","utf8");
  for(const [method,worker] of [["startHighSpeedRecording","startHighSpeedOnWorker"],["stopHighSpeedRecording","stopHighSpeedOnWorker"],["listAudioInputs","listAudioInputsOnWorker"],["setPreferredAudioInput","setPreferredAudioInputOnWorker"]]){
    const signature=`public void ${method}(PluginCall call) {`;
    const from=code.indexOf(signature);
    const dispatch=code.slice(from,from+270);
    expect(dispatch).toContain(`cameraOperationWorker.execute(() -> ${worker}(call))`);
    expect(code).toContain(`private void ${worker}(PluginCall call)`);
  }
  expect(code).toContain("cameraOperationWorker.execute(this::cleanup)");
  expect(code).toContain("cameraOperationWorker.shutdown()");
  expect(code).not.toContain("cameraOperationWorker.shutdownNow()");
 });
 it("moves RAW characteristics enumeration to a dedicated worker",()=>{
  const code=readFileSync("android/app/src/main/java/app/lovable/multicampov/RawDngPlugin.java","utf8");
  expect(code).toContain("preflightWorker.execute(() -> captureRawPreflight(call))");
  expect(code).toContain("preflightWorker.shutdownNow()");
  expect(code).toContain("manager.getCameraCharacteristics(id)");
 });
 it("moves stabilization capability query to a dedicated worker",()=>{
  const code=readFileSync("android/app/src/main/java/app/lovable/multicampov/StabilizationProbePlugin.java","utf8");
  expect(code).toContain("preflightWorker.execute(() -> probePreflight(call))");
  expect(code).toContain("preflightWorker.shutdownNow()");
  expect(code).toContain("manager.getCameraCharacteristics(cameraId)");
 });
});
