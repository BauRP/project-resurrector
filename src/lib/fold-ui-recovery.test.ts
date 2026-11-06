import { describe, expect, it, vi } from "vitest";
import { sanitizeViewState, restoreViewState, saveViewState } from "./fold-ui-recovery";
import { readFileSync } from "node:fs";

describe("Activity recreation view restoration", () => {
  it("keeps real editor and camera navigation without reviving a recorder", () => {
    expect(sanitizeViewState({tab:"editor",playhead:32,editMode:"Cut",aspect:"16:9",captureKind:"video",
      recording:true,recordingPhase:"recording",cameraDeviceId:"old"})).toEqual({
      tab:"editor",playhead:32,editMode:"Cut",aspect:"16:9",captureKind:"video",
    });
  });
  it("round-trips the editor playhead without reviving an active recorder", () => {
    const memory=new Map<string,string>();
    vi.stubGlobal("localStorage",{
      getItem:(key:string)=>memory.get(key)??null,
      setItem:(key:string,value:string)=>{memory.set(key,value);},
    });
    try {
      expect(saveViewState({tab:"editor",playhead:42.75,recording:true,
        cameraDeviceId:"stale"})).toBe(true);
      expect(restoreViewState()).toEqual({tab:"editor",playhead:42.75});
      expect(JSON.stringify(restoreViewState())).not.toContain("recording");
    } finally {vi.unstubAllGlobals();}
  });
  it("wires the editor playhead to the existing bounded Activity recovery", () => {
    const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
    expect(editor).toContain('restoreViewState().playhead ?? 0');
    expect(editor).toContain('setStore({ playhead: timeRef.current })');
    expect(editor).toContain('window.addEventListener("pagehide", flush)');
  });
  it("rejects poisoned and invalid UI state", () => {
    expect(sanitizeViewState({tab:"unknown",playhead:Infinity,editMode:"X".repeat(400),
      aspect:"0;url(test)",captureKind:"mic"})).toEqual({});
    expect(sanitizeViewState(null)).toEqual({});
    expect(sanitizeViewState([])).toEqual({});
  });
});