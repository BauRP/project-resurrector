import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
describe("Android 9 Settings first layout on LDPlayer",()=>{
 const src=readFileSync("src/components/multicam/SettingsTab.tsx","utf8");
 const css=readFileSync("src/styles.css","utf8");
 it("mounts theme, language, network shell, storage, hardware and diagnostics at once",()=>{
   for(const item of ['<Group title={tc.theme}>','<Group help="language"','<Group help="network"','<Group help="cache"','<Group help="hwaccel"','<section className="settings-advanced-tools"']) expect(src).toContain(item);
   const entry=src.slice(src.indexOf("export function SettingsTab()"),src.indexOf('useLayoutEffect(() => { traceUiAction("settings: layout'));
   expect(entry).not.toContain("setTimeout(");
   expect(entry).not.toContain("readyUtilities");
   expect(entry).not.toContain("readyAdvanced");
 });
 it("loads live networking after first paint with an equal-size placeholder",()=>{
  expect(src).toContain('lazy(() => import("./SettingsNetworkContent")');
  expect(src).toContain("SettingsNetworkPlaceholder");
  expect(src).toContain("stableFrames: 3, maxFrameGapMs: 350");
  expect(src).toContain("<SettingsNetworkContent />");
 });
 it("never clips the Camera2 and camera-testing buttons",()=>{
  expect(css).toContain(".settings-fold-workspace .settings-advanced-actions");
  expect(css).toContain("grid-template-columns:minmax(0,1fr)");
  expect(css).toContain("overflow-wrap:anywhere");
 });
});