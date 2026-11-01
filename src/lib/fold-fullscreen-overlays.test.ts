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
    expect(css).toContain('[data-fold-workspace="pane"] .privacy-fold-overlay {\n    top: var(--fold-work-top, 0px);');
    expect(css).toContain('max-height: min(calc(100dvh - 1rem), var(--fold-work-height, 100dvh));');
  });
});
