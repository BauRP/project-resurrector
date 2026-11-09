import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("HardwareRenderer freeze after camera -> settings", () => {
  it("keeps the camera/editor design but avoids forcibly promoting the entire Android screen to a GPU layer", () => {
    const css = readFileSync("src/styles.css","utf8");
    const native = css.slice(css.indexOf("/* Android WebView freeze evidence:"));
    expect(native).toContain(':root[data-multicam-native-webview="true"] .app-shell');
    expect(native).toContain("transform: none !important");
    expect(native).toContain(':root[data-multicam-native-webview="true"] .simulated-feed');
    expect(native).toContain("animation: none !important");
    expect(css).toContain("var(--reference-backdrop)");
    expect(css).toContain("var(--gradient-primary)");
  });
  it("composites only visible ordinary-phone Settings rows while preserving full fold panes", () => {
    const css = readFileSync("src/styles.css", "utf8");
    expect(css).toContain('data-fold-workspace="normal"');
    expect(css).toContain(".settings-fold-workspace main > section:not(.settings-advanced-tools)");
    // Minimal CSS and software-rendered WebView still froze; do not
    // virtualize Android Settings subtrees in Chromium.
    expect(css).toContain("content-visibility: visible;");
    expect(css).not.toContain("content-visibility: auto;");
    expect(css).not.toContain("contain-intrinsic-size: auto 108px;");
    expect(css).toContain("var(--reference-surface)");
  });
  it("detects Android WebView before mounting secondary tabs", () => {
    const app = readFileSync("src/components/multicam/MulticamApp.tsx", "utf8");
    expect(app).toContain('dataset["multicamNativeWebview"] = String(Capacitor.isNativePlatform())');
    expect(app).toContain('tab === "settings" ? (document.documentElement.dataset["multicamFreezeIsolation"] === "settings-shell"');
    expect(app).toContain(': <SettingsCrashBoundary onExit={() => requestTab("camera")}');
    expect(app).toContain('data-freeze-isolation="settings-shell"');
    expect(app).toContain("<SettingsEntryGate>");
    expect(app).toContain("nativeWebView");
    expect(app).toContain('nativeWebView\n        ? <div key={tab}');
    expect(app).toContain('tab === "camera" ? (document.documentElement.dataset["multicamFreezeIsolation"] === "camera-shell"');
    expect(app).toContain(': <CameraEntryGate><CameraWorkspace /></CameraEntryGate>) : <EditorTab />');
    expect(app).toContain('import { CameraEntryGate } from "./CameraEntryGate";');
    expect(app).toContain('<AnimatePresence mode="wait"><motion.div key={tab}');
    expect(app).toContain("transition={{ duration: .18 }}");
  });
});
