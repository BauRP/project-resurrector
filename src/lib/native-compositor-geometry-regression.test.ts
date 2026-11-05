import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";

describe("native WebView compositor and pane geometry stability",()=>{
  it("keeps editor transitions/audio fully functional but does not animate panel height through JS frames",()=>{
    const code=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
    expect(code).toContain('role="tabpanel" initial={{ opacity: 0, y: -6 }}');
    expect(code).toContain('panel === "transitions"');
    expect(code).toContain('panel === "audio" && audio');
    expect(code).not.toContain('animate={{ height: "auto", opacity: 1 }}');
  });
  it("only measures fold-pane rectangles when real separating features are present",()=>{
    const code=readFileSync("src/lib/display-topology.ts","utf8");
    expect(code).toContain("const hasFoldBounds = lastNative?.foldingFeatures.some(f => f.separating) === true");
    expect(code).toContain("if (geometry.hinges.length === 0)");
    expect(code).toContain('root.dataset["foldWorkspace"] = "normal"');
    expect(code).toContain("for (const name of ordinaryVars) clearCss(name)");
    expect(code).toContain("rememberActiveFoldSnapshot(token, details");
    expect(code).toContain("selectSafeFoldWorkspace(geometry.regions,contentBounds)");
  });
  it("retains native glass styling but avoids forcing the full app into a hardware compositing layer",()=>{
    const css=readFileSync("src/styles.css","utf8");
    expect(css).toContain('html[data-multicam-native-webview="true"] .app-shell');
    expect(css).toContain('  transform: none;');
    expect(css).toContain("--reference-backdrop");
    expect(css).toContain("--reference-surface");
  });
});
