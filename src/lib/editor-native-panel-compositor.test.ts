import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("native editor Audio and Transitions must not pile up GPU panels", () => {
  it("uses stable panel identity without losing the effect, audio or transition controls", () => {
    const src = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(src).toContain("const nativeWebView = Capacitor.isNativePlatform()");
    expect(src).toContain('key={nativeWebView ? "native-editor-panel" : panel}');
    expect(src).toContain("transition={{ duration: nativeWebView ? 0 : .18");
    expect(src).toContain("transition={{ duration: nativeWebView ? 0 : .15 }}");
    for (const panel of ['"transitions", "Переходы"','"color", "Цвет"','"audio", "Звук"']) {
      expect(src).toContain(panel);
    }
    expect(src).toContain('{panel === "transitions"');
    expect(src).toContain('{panel === "color"');
    expect(src).toContain('{panel === "audio" && audio}');
    expect(src).toContain("setPanel((p) => p === id ? null : id)");
  });
});
