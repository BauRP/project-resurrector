import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Settings gate diagnosis for a healthy Android MAIN but blocked WebView renderer", () => {
  it("preloads the lazy Settings module before the first tab click and never instantiates Camera2 tools", () => {
    const loader=readFileSync("src/lib/settings-module-loader.ts","utf8");
    const app=readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
    expect(loader).toContain('import("@/components/multicam/SettingsTab")');
    expect(loader).toContain("requestIdleCallback(start, { timeout: 4000 })");
    expect(loader).toContain('window.addEventListener("multicam-settings-navigation-start"');
    expect(loader).toContain("}, 3500)");
    expect(app).toContain('window.dispatchEvent(new Event("multicam-settings-navigation-start"))');
    expect(loader).toContain("settingsModulePromise = null");
    expect(app).toContain("return scheduleSettingsPreload()");
    expect(app).toContain('lazy(() => loadSettingsModule().then');
    expect(loader).not.toContain("CameraDiagnostics(");
    expect(loader).not.toContain("NativeRecordingPanel(");
  });
  it("installs native compositor protections before the new Settings screen paints", () => {
    const app=readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
    expect(app).toContain('useLayoutEffect(() => {\n    document.documentElement.dataset["activeMulticamTab"] = tab;');
    expect(app).toContain('useLayoutEffect(() => {\n    document.documentElement.dataset["multicamNativeWebview"]');
  });
  it("uses the Android clipboard without synchronous WebView execCommand or DOM selection", () => {
    const notice=readFileSync("src/components/multicam/AndroidFreezeNotice.tsx","utf8");
    const bridge=readFileSync("src/lib/ui-freeze-bridge.ts","utf8");
    const android=readFileSync("android/app/src/main/java/app/lovable/multicampov/UiFreezePlugin.java","utf8");
    expect(notice).toContain("uiFreeze.copyReport({ report })");
    expect(notice).not.toContain('document.execCommand("copy")');
    expect(notice).not.toContain('document.createElement("textarea")');
    expect(notice).toContain('readOnly value={report}');
    expect(bridge).toContain("copyReport(options: { report: string }): Promise<void>");
    expect(android).toContain('@PluginMethod public void copyReport(PluginCall call)');
    expect(android).toContain("ClipboardManager");
    expect(android).toContain("ClipData.newPlainText(");
  });
});
