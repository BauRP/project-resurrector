import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("reference screenshots: exact camera and editor layout", () => {
  const camera = readFileSync("src/components/multicam/CameraTab.tsx","utf8");
  const editor = readFileSync("src/components/multicam/EditorPro.tsx","utf8");
  const app = readFileSync("src/components/multicam/MulticamApp.tsx","utf8");
  const css = readFileSync("src/styles.css","utf8");

  it("removes the left camera HUD strip, not its buttons or their position", () => {
    expect(camera).toContain('className="camera-hud-controls scrollbar-none flex min-w-0 flex-1 gap-1"');
    for(const name of ['toggleHud("shutter")','toggleHud("iso")','toggleHud("wb")','toggleHud("grid")']) expect(camera).toContain(name);
    expect(camera).toContain('aria-label="ИИ-ассистент"');
    expect(camera).toContain('title="Режим чистого кадра"');
    expect(css).toContain(".camera-hud-controls {\n background:transparent;");
    expect(css).toContain("overflow-x:auto;overflow-y:hidden;");
  });

  it("adds equal top and bottom ruler space, retaining tick text and pin", () => {
    expect(editor).toContain("float-left flex h-7 items-center");
    expect(editor).toContain('className="relative h-7 cursor-pointer border-b');
    expect(editor).toContain('className="absolute top-[9px] h-2.5 border-l');
    expect(28-10-9).toBe(9); // both sides around the labels are 9px
    expect(editor).toContain("rulerTicks.map((s)");
    expect(editor).toContain('aria-label={pinTl ? "Открепить таймлайн"');
  });

  it("pins Connect at the same upper-right location in camera and editor", () => {
    expect(app).toContain('app-header ${tab === "editor" ? "app-header-editor" : ""}');
    expect(css).toContain(".app-header-editor {display:grid;grid-template-columns:minmax(0,1fr) auto;row-gap:0;}");
    expect(css).toContain(".app-header-editor .app-header-actions {display:flex;");
    expect(css).not.toContain("grid-template-columns:2.5rem auto minmax(0,1fr)");
    expect(app).toContain('aria-label="Медиатека"');
    expect(app).toContain('aria-label={t("export")} title={t("export")}');
    expect(app).toContain('className="connect-pill active header-icon-action"');
    expect(app).toContain('setStore({ exportOpen: true, mediaOpen: false })');
  });

  it("shortens all three bottom tabs but keeps Android safe-area and tap targets", () => {
    expect(css).toContain("--nav-h:calc(clamp(3.6rem,6.85dvh,4.05rem) + env(safe-area-inset-bottom))");
    expect(css).toContain("padding-bottom: env(safe-area-inset-bottom)");
    expect(css).toContain(".bottom-nav button {height:100%;gap:.13rem;");
    expect(app).toContain('className="bottom-nav"');
  });
});
