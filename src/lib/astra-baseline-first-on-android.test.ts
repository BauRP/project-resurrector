import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra cold Android WebView is isolated from app startup",()=>{
 const instrument=readFileSync("android/app/src/androidTest/java/app/lovable/multicampov/MulticamFreezeNavigationInstrumentedTest.java","utf8");
 it("runs standalone Chromium FIRST, then the untouched 30 second native app",()=>{
   const baseline=instrument.indexOf("public void a000BaselineChromiumWithoutReactStillExecutesJavascript()");
   const idle=instrument.indexOf("public void a00ColdStartIdleThirtySecondsWithoutTouches()");
   expect(baseline).toBeGreaterThan(0);
   expect(idle).toBeGreaterThan(0);
   const before=instrument.slice(baseline,idle);
   expect(before).toContain("MinimalWebViewActivity.class");
   expect(before).not.toContain("MainActivity.class");
   expect(instrument).toContain("@org.junit.FixMethodOrder(org.junit.runners.MethodSorters.NAME_ASCENDING)");
   expect("a000BaselineChromiumWithoutReactStillExecutesJavascript"
     < "a00ColdStartIdleThirtySecondsWithoutTouches").toBe(true);
 });
 it("keeps the full thirty-second no-tap app test after baseline",()=>{
   expect(instrument).toContain("start < 30000L");
   expect(instrument).toContain("MainActivity.class");
   expect(instrument).toContain('eval(running, view, "1+1===2")');
 });
});
