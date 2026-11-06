import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("Independent Camera2 deadlines, including completely blocked OEM callbacks", () => {
  const raw=readFileSync("android/app/src/main/java/app/lovable/multicampov/RawDngPlugin.java","utf8");
  const stab=readFileSync("android/app/src/main/java/app/lovable/multicampov/StabilizationProbePlugin.java","utf8");
  it("has timers on separate schedulers rather than the same potentially blocked camera Looper",()=>{
    expect(raw).toContain("multicam-raw-deadline");
    expect(raw).toContain("deadlineWorker.schedule(this::onDeadline, 15000, TimeUnit.MILLISECONDS)");
    expect(stab).toContain("multicam-stabilization-deadline");
    expect(stab).toContain("deadlineWorker.schedule(this::onDeadline, 7000, TimeUnit.MILLISECONDS)");
    expect(raw).not.toContain('handler.postDelayed(() -> fail("Истекло время ожидания RAW-кадра');
    expect(stab).not.toContain('handler.postDelayed(() -> finish("unknown"');
  });
  it("never performs CameraDevice cleanup synchronously from Activity teardown",()=>{
    for(const src of [raw,stab]){
      const start=src.indexOf("protected void handleOnDestroy()");
      const end=src.indexOf("super.handleOnDestroy();",start);
      const block=src.slice(start,end);
      expect(block).toContain("deadlineWorker.execute(");
      expect(block).not.toContain(".fail(");
      expect(block).not.toContain("cleanup();");
    }
  });
  it("gives JS the timeout answer before attempting to close an OEM-stuck camera",()=>{
    expect(raw.indexOf('call.reject("Истекло время ожидания RAW-кадра')).toBeLessThan(raw.indexOf("handler.post(release)"));
    expect(stab.indexOf('result.put("state", "unknown")')).toBeLessThan(stab.indexOf("handler.post(this::cleanup)"));
    for(const src of [raw,stab])expect(src).toContain("compareAndSet(false, true)");
  });
});