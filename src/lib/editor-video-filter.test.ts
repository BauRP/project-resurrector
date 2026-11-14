import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {editorVideoFilter, needsEditorColorFilter} from "./editor-video-filter";

describe("video compositor avoids identity SVG filter without dropping effects",()=>{
  it("keeps normal full-quality video on the native decoder/compositor path",()=>{
    expect(needsEditorColorFilter(undefined)).toBe(false);
    expect(needsEditorColorFilter({temperature:0,hue:0,contrast:0})).toBe(false);
    expect(editorVideoFilter("c1",undefined,"none","")).toBe("none");
    expect(editorVideoFilter("c1",{temperature:0},"none","")).toBe("none");
  });
  it("preserves color correction on any actively edited video layer",()=>{
    expect(needsEditorColorFilter({temperature:5})).toBe(true);
    expect(needsEditorColorFilter({exposure:-2})).toBe(true);
    expect(editorVideoFilter("clip", {temperature:5},"none","")).toBe("url(#cc-clip)");
    expect(editorVideoFilter("clip", {temperature:5},"sepia(.25) saturate(1.2)","brightness(1.2)"))
      .toBe("url(#cc-clip) sepia(.25) saturate(1.2) brightness(1.2)");
  });
  it("keeps looks and transitions enabled without a zero-value SVG filter",()=>{
    expect(editorVideoFilter("clip",undefined,"grayscale(1) contrast(1.1)",""))
      .toBe("grayscale(1) contrast(1.1)");
    expect(editorVideoFilter("clip",{saturation:0},"none","blur(7px)"))
      .toBe("blur(7px)");
  });
  it("renders filters only for corrected clips and keeps the original video source",()=>{
    const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
    expect(editor).toContain("visibleVideos.filter(i => needsEditorColorFilter(i.color)).map(");
    expect(editor).toContain("filter:editorVideoFilter(i.id, i.color, LOOKS[i.look]");
    expect(editor).not.toContain('style={{filter:`url(#cc-${i.id})');
    expect(editor).toContain('source={proxies[i.mediaId] ?? mediaById.get(i.mediaId)?.url ?? ""}');
  });
});
