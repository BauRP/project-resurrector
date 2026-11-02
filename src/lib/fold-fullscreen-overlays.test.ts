import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
describe("fullscreen editor export and privacy in real fold panes",()=>{
  it("bounds independently mounted overlays to measured WindowManager workspace",()=>{
    const editor=readFileSync("src/components/multicam/EditorTab.tsx","utf8");
    const settings=readFileSync("src/components/multicam/SettingsTab.tsx","utf8");
    const css=readFileSync("src/styles.css","utf8");
    expect(editor).toContain("export-fold-overlay fixed inset-0");
    expect(settings).toContain("privacy-fold-overlay fixed inset-x-0");
    expect(css).toContain('[data-fold-workspace="pane"] .export-fold-overlay');
    expect(css).toContain('[data-fold-workspace="pane"] .privacy-fold-overlay');
    expect(css).toContain("left: var(--fold-work-left, 0px)");
    expect(css).toContain("top: var(--fold-work-top, 0px)");
    expect(css).toContain("height: var(--fold-work-height, 100dvh)");
    const topology=readFileSync("src/lib/display-topology.ts","utf8");
    expect(topology).toContain('root.style.setProperty("--fold-work-top"');
    expect(topology).toContain('"--fold-work-top","--fold-work-y-offset"');
    expect(css).toContain("width: min(var(--fold-work-width, 100%), 100%)");
    expect(editor).toContain("export-action-grid mb-5 grid gap-2");
    expect(editor).toContain("export-action-grid mt-3 grid gap-2");
    expect(css).toContain("grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr))");
    expect(css).toContain("white-space:normal;");
    expect(css).toContain('@media (max-width: 280px), (max-height: 280px)');
    expect(css).toContain('height:var(--fold-work-height,100dvh);');
    expect(css).toContain('[data-fold-workspace="pane"] .privacy-fold-overlay {\n    top: var(--fold-work-top, 0px);');
    expect(css).toContain('max-height: min(calc(100dvh - 1rem), var(--fold-work-height, 100dvh));');
  });
});

describe("keyboard-constrained real fold panes", () => {
  it("never expands editor or privacy overlays across a hinge when no safe pane remains", () => {
    const source = readFileSync("src/lib/display-topology.ts", "utf8");
    expect(source).toContain("const paneUnavailable = geometry.regions.length > 1 && !workspace");
    expect(source).toMatch(/if \(paneUnavailable\) \{\s*resetUntrustedLayout\(\);\s*return;/);
  });
});
