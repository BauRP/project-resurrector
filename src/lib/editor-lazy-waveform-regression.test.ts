import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("opening editor and transitions never decodes entire unused media library",()=>{
 it("uses metadata-only library loading, with waveform computation limited to actual timeline clips",()=>{
  const code=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
  const start=code.indexOf("async function analyse(clip:");
  const end=code.indexOf("async function analyseWaveformForTimeline",start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const library=code.slice(start,end);
  expect(library).not.toContain("clip.blob.arrayBuffer()");
  expect(library).toContain("analysisCache.set(clip.id, { duration, peaks })");
  expect(code).toContain("const timelineWaveformKey = useMemo(");
  expect(code).toContain("if (!required.has(m.id) || waveformAttempted.current.has(m.id)) continue");
  expect(code).toContain("const peaks = await analyseWaveformForTimeline(original, m.duration)");
  expect(code).toContain("setMedia(current => current.map(");
  expect(code).toContain("await new Promise<void>(resolve => window.setTimeout(resolve, 0))");
 });
});
