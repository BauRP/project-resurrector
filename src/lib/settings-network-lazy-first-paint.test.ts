import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Settings JavaScript does not eagerly pull networking and WebRTC into the first paint", () => {
  const settings = readFileSync("src/components/multicam/SettingsTab.tsx","utf8");
  const network = readFileSync("src/components/multicam/SettingsNetworkContent.tsx","utf8");

  it("loads live mesh peers lazily behind the full Settings first-paint boundary", () => {
    expect(settings).not.toContain('from "@/lib/mesh"');
    expect(settings).not.toContain('from "./useMesh"');
    expect(settings).not.toContain("mesh.diagnose()");
    expect(settings).toContain('lazy(() => import("./SettingsNetworkContent")');
    expect(settings).toContain("{readyBody && <>");
    expect(settings).toContain("<SettingsNetworkContent />");
    expect(settings).toContain("Светлая");
    expect(settings).toContain("Тёмная");
    expect(settings).not.toContain('import { cacheBytes, clearPreviewCache } from "@/lib/media-cache"');
    expect(settings).toContain('const { cacheBytes } = await import("@/lib/media-cache")');
    expect(settings).toContain('const { clearPreviewCache } = await import("@/lib/media-cache")');
  });

  it("preserves all mesh diagnostics and connection status once the network panel loads", () => {
    expect(network).toContain('from "@/lib/mesh"');
    expect(network).toContain('from "./useMesh"');
    expect(network).toContain("mesh.diagnose()");
    expect(network).toContain('s.set({ diagnostics: result })');
    expect(network).toContain('mesh.localId ?? s.sessionCode');
    expect(network).toContain('peers.length + 1');
    expect(network).toContain('bounded(mesh.diagnose(), 3500');
    expect(network).toContain("Нет ответа от устройств.");
  });
});
