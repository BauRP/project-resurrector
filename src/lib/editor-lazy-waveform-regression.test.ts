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
  expect(code).toContain("const peaks = await runEditorQuietMediaWork(abort.signal, () => playbackActive.current,");
  expect(code).toContain("() => analyseWaveformForTimeline(original, m.duration, attemptSignal)");
  expect(code).toContain("() => editorMediaWorkQueue.run(");
  expect(code).toContain("setMedia(current => current.map(");
  expect(code).toContain("await new Promise<void>(resolve => window.setTimeout(resolve, 0))");
 });
});

// Cancellation of an old metadata decoder is required in addition to lazy
// waveforms. The editor must never reopen a stream after a tab switch.
import {readFileSync as readEditorMetadataSource} from "node:fs";
import {describe as describeMetadata, it as metadataIt, expect as metadataExpect} from "vitest";
describeMetadata("editor media decoder ownership after tab handoff",()=>{
  metadataIt("aborts the previous library load before starting the next one",()=>{
    const source=readEditorMetadataSource("src/components/multicam/EditorPro.tsx","utf8");
    metadataExpect(source).toContain("activeLibraryLoad.current?.abort()");
    metadataExpect(source).toContain("signal?.addEventListener(\"abort\", onAbort, { once: true })");
    metadataExpect(source).toContain("analyse(clip, controller.signal)");
    metadataExpect(source).toContain("activeLibraryLoad.current = null");
  });
});
