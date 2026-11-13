import { afterEach, describe, expect, it, vi } from "vitest";
import { waitForEditorQuietInput } from "./editor-quiet-input";
import { readFileSync } from "node:fs";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Android 9 editor avoids background video encoders during user interaction",()=>{
 it("does not start optional encoding while the user is playing a video", async()=>{
  vi.useFakeTimers();
  let playing=true;
  const controller=new AbortController();
  const result=vi.fn();
  const pending=waitForEditorQuietInput(controller.signal,()=>playing,1000); void pending.then(result);
  await vi.advanceTimersByTimeAsync(5000);
  expect(result).not.toHaveBeenCalled();
  playing=false;
  await vi.advanceTimersByTimeAsync(250);
  expect(await pending).toBe(true);
 });
 it("each editor tap postpones the expensive second video encoder",async()=>{
  vi.useFakeTimers();
  const ctrl=new AbortController();
  const result=vi.fn();
  const pending=waitForEditorQuietInput(ctrl.signal,()=>false,1000); void pending.then(result);
  await vi.advanceTimersByTimeAsync(950);
  window.dispatchEvent(new Event("pointerdown"));
  await vi.advanceTimersByTimeAsync(750);
  expect(result).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(300);
  expect(await pending).toBe(true);
 });
 it("navigation abort cancels queued encoder without leaking timers",async()=>{
  vi.useFakeTimers();
  const ctrl=new AbortController();
  const pending=waitForEditorQuietInput(ctrl.signal,()=>true,1000);
  ctrl.abort();
  await expect(pending).resolves.toBe(false);
  expect(vi.getTimerCount()).toBe(0);
 });
 it("keeps original proxy and deferred video decoder functions",()=>{
  const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
  expect(editor).toContain("runEditorQuietMediaWork(abort.signal, () => playbackActive.current");
  expect(editor).toContain("() => generateProxy(m.id, m.url, attemptSignal)");
  expect(editor).toContain("source={proxies[i.mediaId] ?? mediaById.get(i.mediaId)?.url ?? \"\"}");
 });
});