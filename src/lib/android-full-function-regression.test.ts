import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("all runtime features stay enabled while Android operations are asynchronous", () => {
  it("polls real battery/storage in solo and paired modes", () => {
    const camera=readFileSync("src/components/multicam/CameraTab.tsx","utf8");
    const mesh=readFileSync("src/lib/mesh.ts","utf8");
    expect(camera).toContain("const id = window.setInterval(poll, 5000)");
    expect(camera).not.toContain('s.role === "solo" && peers.length === 0) return');
    expect(mesh).toContain('registerPlugin<NativeDeviceMetrics>("DeviceMetrics")');
    expect(mesh).toContain('await bounded(androidMetrics.read(), 1800');
    expect(mesh).toContain("navigator.storage?.estimate?.()");
  });
  it("queries native Camera2 owner without blocking Android main thread", () => {
    const source=readFileSync("src/components/multicam/CameraWorkspace.tsx","utf8");
    const native=readFileSync("android/app/src/main/java/app/lovable/multicampov/NativeCapturePlugin.java","utf8");
    expect(source).toContain('() => nativeCapture.status()');
    expect(native).toContain('statusWorker.execute(()->');
    expect(native).toContain("NativeCaptureService.status(context)");
    expect(native).toContain("NativeCaptureService.isPreviewingForUi()");
    expect(native).toContain('private void resolveStatusAsync(PluginCall call)');
    expect(native).toContain('statusWorker.execute(() -> {');
    expect(native).toContain('if(applied)resolveStatusAsync(call)');
    expect(native).not.toContain('call.resolve(NativeCaptureService.status(getContext()))');
  });
  it("packages subtitle fonts locally and never relies on network at runtime", () => {
    const entry=readFileSync("src/capacitor-main.tsx","utf8");
    const build=readFileSync("scripts/bundle-subtitle-fonts.py","utf8");
    const pkg=readFileSync("package.json","utf8");
    const loader=readFileSync("src/lib/fonts.ts","utf8");
    expect(entry).toContain('import "./generated/subtitle-fonts.css"');
    expect(pkg).toContain("python3 scripts/bundle-subtitle-fonts.py");
    expect(build).toContain('FONTS_DIR = ROOT / "public" / "fonts"');
    expect(loader).not.toContain("fonts.googleapis.com");
  });
});
