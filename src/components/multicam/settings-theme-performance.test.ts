import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("settings entry and screenshot 111/222 theme safety", () => {
  it("does not enumerate IndexedDB video proxy blobs on entry", () => {
    const settings = read("src/components/multicam/SettingsTab.tsx");
    expect(settings).not.toContain("void cacheBytes().then");
    expect(settings).toContain("const measureCache = async");
    expect(settings).toContain("onClick={() => void measureCache()}");
    expect(settings).toContain("clearPreviewCache()");
  });
  it("keeps heavy Camera2 and diagnostics code out of the initial settings bundle", () => {
    const settings = read("src/components/multicam/SettingsTab.tsx");
    expect(settings).toContain('lazy(() => import("./NativeRecordingPanel")');
    expect(settings).toContain('lazy(() => import("./CameraDiagnostics")');
    expect(settings).toContain("<Suspense fallback=");
    expect(settings).toContain("<SettingsToolsBoundary key=");
    expect(settings).toContain("static getDerivedStateFromError()");
    expect(settings).toContain('{advancedPanel === "native" && <NativeRecordingPanel previewIntervalMs={850} />}');
    expect(settings).toContain('{advancedPanel === "diagnostics" && <CameraDiagnostics />}');
    const workspace = read("src/components/multicam/CameraWorkspace.tsx");
    expect(workspace).toContain('lazy(() => import("./NativeRecordingPanel")');
    expect(workspace).toContain('<Suspense fallback=');
    const native = read("src/components/multicam/NativeRecordingPanel.tsx");
    expect(native).toContain("previewIntervalMs = 250");
    expect(native).toContain("Math.max(250,Math.min(previewIntervalMs,2000))");

  });
  it("keeps notification, header and nav visible across both themes", () => {
    const app = read("src/components/multicam/MulticamApp.tsx");
    const css = read("src/styles.css");
    expect(app).toContain('className="multicam-brand min-w-0"');
    expect(app).toContain('>MULTI-CAM POV</p>');
    expect(app).toContain('document.documentElement.classList.toggle("dark", theme === "dark")');
    expect(app).toContain('className="bottom-nav"');
    expect(css).toContain("/* MULTI-CAM POV 111/222 theme reference:");
    expect(css).toContain("/* Settings entry performance and 111/222 brand identity */");
    expect(css).toContain(".app-navigation-notice {");
    const camera = read("src/components/multicam/CameraTab.tsx");
    expect(camera).toContain('camera-preview-placeholder');
    expect(camera).toContain('camera-preview-retry');
    expect(css).toContain(".camera-screen.camera-offline");
    expect(css).toContain(".multicam-brand-mark::before");
    expect(css).toContain('[data-multicam-native-webview="true"] .glass-panel');
  });
  it("avoids expensive settings DOM mutation observation and does not disturb fold dialogs", () => {
    const app = read("src/components/multicam/MulticamApp.tsx");
    const css = read("src/styles.css");
    expect(app).toContain('const contentObserver = tab !== "editor"');
    expect(app).toContain('if (tab === "editor" && port.firstElementChild instanceof HTMLElement)');
    expect(css).not.toContain(".settings-fold-workspace { contain:layout style; }");
    expect(css).toContain('[data-fold-workspace="pane"] .privacy-fold-overlay');
    expect(css).toContain("height: var(--fold-work-height, 100dvh)");
  });
});
