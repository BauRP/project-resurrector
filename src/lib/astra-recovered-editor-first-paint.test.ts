import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra recovered Editor must not scan the library on first Android frame", () => {
 const editor=readFileSync("src/components/multicam/EditorPro.tsx","utf8");
 it("delays only initial Android media enumeration until responsive frames",()=>{
   expect(editor).toContain("if (Capacitor.isNativePlatform()) scheduleLoad();");
   expect(editor).toContain("scheduleAfterResponsivePaint(() => {");
   expect(editor).toContain("stableFrames: 4, maxFrameGapMs: 350");
   expect(editor).toContain("visibleOnly: true");
   expect(editor).toContain("else void load();");
 });
 it("preserves user-triggered library refresh and cancels loads on unmount",()=>{
   expect(editor).toContain('window.addEventListener("multicam-clips-changed", onClipsChanged)');
   expect(editor).toContain("activeLibraryLoad.current?.abort()");
   expect(editor).toContain("cancelInitialLoad?.()");
   expect(editor).toContain("loadGeneration.current++");
 });
});
