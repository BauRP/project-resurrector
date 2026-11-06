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
  it("detects Android WebView before mounting secondary tabs", () => {
    const app = readFileSync("src/components/multicam/MulticamApp.tsx", "utf8");
    expect(app).toContain('dataset["multicamNativeWebview"] = String(Capacitor.isNativePlatform())');
    expect(app).toContain('tab === "settings" ? <SettingsCrashBoundary');
    expect(app).toContain("<SettingsEntryGate>");
    expect(app).toContain("nativeWebView");
    expect(app).toContain('nativeWebView\n        ? <div key={tab}');
    expect(app).toContain('tab === "camera" ? <CameraWorkspace /> : <EditorTab />');
    expect(app).toContain('<AnimatePresence mode="wait"><motion.div key={tab}');
    expect(app).toContain("transition={{ duration: .18 }}");
  });
});
