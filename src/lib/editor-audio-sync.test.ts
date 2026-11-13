import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { syncEditorAudioElement } from "./editor-audio-sync";

function fakeAudio() {
  let currentTime = 0;
  let writes = 0;
  let paused = true;
  let resolvePlay!: () => void;
  const play = vi.fn(() => new Promise<void>(resolve => { resolvePlay = resolve; }));
  const pause = vi.fn(() => { paused = true; });
  const el = {
    get currentTime() { return currentTime; },
    set currentTime(value: number) { currentTime = value; writes++; },
    get paused() { return paused; },
    get seeking() { return false; },
    playbackRate: 1,
    play, pause,
  } as unknown as HTMLAudioElement;
  return {el, play, pause, resolve: () => { paused = false; resolvePlay(); }, get writes() { return writes; }};
}

describe("editor original-audio decoder responsiveness", () => {
  it("does not start competing play promises on every timeline tick", async () => {
    const a = fakeAudio();
    syncEditorAudioElement(a.el, 1, 1, true, 1000);
    syncEditorAudioElement(a.el, 1.033, 1, true, 1033);
    syncEditorAudioElement(a.el, 1.066, 1, true, 1066);
    expect(a.play).toHaveBeenCalledTimes(1);
    expect(a.writes).toBe(1);
    a.resolve();
    await Promise.resolve();
    syncEditorAudioElement(a.el, 1.10, 1, true, 1100);
    expect(a.play).toHaveBeenCalledTimes(1);
  });

  it("does not continually seek a lagging decoder but honors explicit jumps", async () => {
    const a = fakeAudio();
    syncEditorAudioElement(a.el, 1, 1, true, 1000);
    a.resolve();
    await Promise.resolve();
    syncEditorAudioElement(a.el, 1.1, 1, true, 1100);
    syncEditorAudioElement(a.el, 1.133, 1, true, 1133);
    expect(a.writes).toBe(1);
    syncEditorAudioElement(a.el, 3.0, 1, true, 1200);
    expect(a.writes).toBe(2);
    syncEditorAudioElement(a.el, 3.033, 1, true, 1233);
    expect(a.writes).toBe(2);
  });

  it("never resumes playback after pause when a late play request finishes", async () => {
    const a = fakeAudio();
    syncEditorAudioElement(a.el, 1, 1, true, 1000);
    syncEditorAudioElement(a.el, 1, 1, false, 1010);
    a.resolve();
    await Promise.resolve();
    expect(a.pause).toHaveBeenCalledTimes(1);
  });

  it("preserves original audio and all timeline lanes", () => {
    const editor = readFileSync("src/components/multicam/EditorPro.tsx", "utf8");
    expect(editor).toContain("const activeAudible = useMemo(");
    expect(editor).toContain("syncEditorAudioElement(el, target, i.speed, playing && inRange && !i.reverse)");
    expect(editor).toContain("{activeAudible.map((i) => <audio");
    expect(editor).toContain('src={mediaById.get(i.mediaId)?.url}');
    expect(editor).toContain("for (const i of audible)");
  });
});
