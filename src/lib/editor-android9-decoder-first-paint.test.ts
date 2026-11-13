import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("Android 9 old WebView paints before expensive Editor media work",()=>{
 const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
 const scheduler=readFileSync("src/lib/editor-responsive-idle.ts","utf8");
 it("keeps original thumbnails and proxy with frame-checked decoder starts",()=>{
   const start=editor.indexOf("const clear = () =>");
   const end=editor.indexOf("return () => {",start);
   const body=editor.slice(start,end);
   expect(body.match(/waitForEditorResponsiveIdle\(abort.signal\)/g)?.length).toBe(2);
   expect(body).toContain("() => makeThumbs(m.url, m.duration, 10, attemptSignal)");
   expect(body).toContain("() => generateProxy(m.id, m.url, attemptSignal)");
   expect(body).toContain("editorMediaWorkQueue.run(");
   expect(body).toContain("runEditorQuietMediaWork(abort.signal, () => playbackActive.current");
   expect(body).toContain("if (!live || abort.signal.aborted) return");
 });
 it("does not start thumbnail or waveform decoders while a video is playing",()=>{
   const thumb = editor.slice(editor.indexOf("frames = thumbCache.get(m.id)"), editor.indexOf("setThumbs(cur =>"));
   expect(thumb).toContain("runEditorQuietMediaWork(abort.signal, () => playbackActive.current");
   const waveform = editor.slice(editor.indexOf("const responsive = await waitForEditorResponsiveIdle"), editor.indexOf("analyseWaveformForTimeline(original"));
   expect(waveform).toContain("waitForEditorQuietInput(abort.signal, () => playbackActive.current)");
 });
 it("supports false-hidden Android and abort-cancellable idle stages",()=>{
   expect(scheduler).toContain("maxFrameGapMs: 350");
   expect(scheduler).toContain("visibleOnly: true");
   expect(scheduler).toContain("cancelFrames?.()");
   expect(scheduler).toContain('signal?.addEventListener("abort"');
 });
});