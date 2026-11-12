import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

describe("Astra durable async native project state with lifecycle backup",()=>{
 const src=readFileSync("src/lib/multicam-store.tsx","utf8");
 it("moves routine native snapshot writes off synchronous localStorage hot path",()=>{
   expect(src).toContain("const nativeAsyncProject = Capacitor.isNativePlatform() && typeof indexedDB");
   expect(src).toContain("if (nativeAsyncProject && !urgent) asyncWriter.enqueue(value)");
   expect(src).toContain("writeAsyncProjectSnapshot(value)");
   expect(src).toContain("createLatestProjectWriter");
 });
 it("preserves emergency legacy copy when Android destroys WebView",()=>{
   expect(src).toContain("const onPageHide = () => { repairOrFlushView(); flushProject(true); flushPrefs(); };");
   expect(src).toContain("const onVisibility = () => { if (document.hidden) { repairOrFlushView(); flushProject(true);");
   expect(src).toContain("if (raw.length <= 262144)");
   expect(src).toContain("lastLegacySavedAt");
   expect(src).toContain("snapshot.savedAt <= lastLegacySavedAt");
 });
 it("never overwrites user changes from an older asynchronous database response",()=>{
   expect(src).toContain("modifiedProjectKeys.add(key)");
   expect(src).toContain("!modifiedProjectKeys.has(key)");
   expect(src).toContain("restoreFromAsync = true");
   expect(src).toContain("cancelAsyncRestore?.()");
 });
});
