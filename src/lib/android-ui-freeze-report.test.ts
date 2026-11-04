import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Android freezes leave evidence without disabling features", () => {
  it("monitors UI from a daemon, not the main Android thread", () => {
    const src=readFileSync("android/app/src/main/java/app/lovable/multicampov/UiFreezeMonitor.java","utf8");
    const act=readFileSync("android/app/src/main/java/app/lovable/multicampov/MainActivity.java","utf8");
    expect(src).toContain("Looper.getMainLooper().getThread().getStackTrace()");
    expect(src).toContain("ANR_THRESHOLD_MS = 6500L");
    expect(src).toContain('thread.setDaemon(true)');
    expect(act).toContain("UiFreezeMonitor.start(getApplicationContext())");
    expect(act).toContain("UiFreezeMonitor.setForeground(false)");
  });
  it("allows users to copy a saved UI stack trace after recovery", () => {
    const app=readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
    const notice=readFileSync("src/components/multicam/AndroidFreezeNotice.tsx","utf8");
    expect(app).toContain("<AndroidFreezeNotice />");
    expect(notice).toContain("Скопировать отчёт");
    expect(notice).toContain('bounded(uiFreeze.read(), 1500');
    expect(notice).toContain("navigator.clipboard?.writeText");
  });
});
