import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("Camera2 high-speed callback safety",()=>{
 it("resolves/rejects start once even if OEM sends multiple callbacks",()=>{
  const s=readFileSync("android/app/src/main/java/app/lovable/multicampov/MultiCamNativePlugin.java","utf8");
  const start=s.slice(s.indexOf("public void startHighSpeedRecording("),s.indexOf("Analyze actual persisted"));
  expect(start).toContain("startCallSettled.compareAndSet(false, true)");
  expect(start).toContain("resolveStart.accept(res)");
  expect(start).toContain('rejectStart.accept("Камера отключена во время запуска")');
  expect(start).toContain('rejectStart.accept("Ошибка камеры " + error)');
  expect(start).toContain("reportHighSpeedState(\"recording\"");
  expect(start).toContain("hsSession.setRepeatingBurst");
  expect(start).toContain("recorder.start()");
 });
});
