import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra thirty-second untouched Android startup regression", () => {
  const code=readFileSync("android/app/src/androidTest/java/app/lovable/multicampov/MulticamFreezeNavigationInstrumentedTest.java","utf8");
  it("actually launches app with no interaction for at least 30 seconds",()=>{
    const start=code.indexOf("public void a00ColdStartIdleThirtySecondsWithoutTouches()");
    const end=code.indexOf("public void a0IdleLaunchRendererRespondsWithoutUserMedia()",start);
    const test=code.slice(start,end);
    expect(test).toContain("MainActivity.class");
    expect(test).toContain("start < 30000L");
    expect(test).toContain("Thread.sleep(1500)");
    expect(test).toContain("eval(running, view, \"1+1===2\")");
    expect(test).not.toContain("click(running");
    expect(test).not.toContain("startHighSpeedRecording");
    expect(test).not.toContain("requestPermissions");
  });
});
