import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("reference compact MULTI-CAM POV design", () => {
  const css = readFileSync("src/styles.css", "utf8");
  const editor = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
  const app = readFileSync("src/components/multicam/MulticamApp.tsx", "utf8");
  const settings = readFileSync("src/components/multicam/SettingsTab.tsx", "utf8");
  const camera = readFileSync("src/components/multicam/CameraWorkspace.tsx", "utf8");

  it("always renders one real video and one real audio lane in a new empty project", () => {
    expect(editor).toContain("const [vTracks, setVTracks] = useState(1)");
    expect(editor).toContain("const [aTracks, setATracks] = useState(1)");
    expect(editor).toContain("const laneEls = useMemo(() => lanes.map((lane) =>");
    expect(editor).not.toContain("lanes.filter((lane) => items.some");
    expect(editor).toContain("{laneEls}");
    expect(editor).toContain('label: n === 1 ? "Видео" : `Видео ${n}`');
    expect(editor).toContain('label: n === 1 ? "Аудио" : `Аудио ${n}`');
    expect(editor).toContain('Добавить видео дорожку');
    expect(editor).toContain('Добавить аудио дорожку');
    expect(editor).toContain('const HEAD = 104;');
    expect(css).toContain('.timeline-header button.timeline-lane-toggle');
  });

  it("does not globally enlarge camera HUD, editor toolbar or settings buttons to 48px", () => {
    expect(css).not.toMatch(/button\s*\{\s*min-height:\s*48px;\s*min-width:\s*48px/);
    expect(css).toContain(".hud-chip { height: 1.75rem;");
    expect(css).toContain(".timeline-play { width: 2.65rem; height: 2.65rem;");
    expect(css).toContain(".zoom-slider { min-height: 1.75rem;");
    expect(css).toContain("min-height:2.8rem; padding:.5rem .8rem");
    expect(css).toContain(".theme-seg button { flex:");
  });

  it("retains a single-line action toolbar with compact connect and export", () => {
    expect(css).toContain(".app-header { grid-template-columns: minmax(0,1fr) auto;");
    expect(css).toContain(".app-header > :last-child { min-width: 0; display: flex; flex-wrap: nowrap;");
    expect(css).toContain(".connect-pill { min-height: 2.25rem;");
    expect(app).toContain("aria-label=\"Медиатека\"");
    expect(app).toContain("setStore({ exportOpen: true, mediaOpen: false })");
  });

  it("restores violet and pink accents without changing the dark physical viewfinder", () => {
    expect(css).toContain("#7953F8");
    expect(css).toContain("#C443A5");
    expect(css).toContain("--viewfinder: oklch(0.08 0.015 245);");
    expect(css).toContain("--gradient-stage:");
  });

  it("keeps native mode selection but stops it from taking a large camera panel", () => {
    expect(camera).toContain('className="camera-mode-switch flex shrink-0');
    expect(camera).toContain('className="h-7 min-h-0 px-2 text-[10px]"');
    expect(camera).toContain('void switchTo("native")');
    expect(camera).toContain('void switchTo("web")');
    expect(settings).toContain('className="text-lg font-semibold"');
  });

  it("preserves safe pane and bottom navigation rules on fold devices", () => {
    expect(css).toContain('[data-fold-workspace="pane"]');
    expect(css).toContain("env(safe-area-inset-bottom)");
    expect(css).toContain("var(--nav-h)");
  });
});
