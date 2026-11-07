import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
const java=readFileSync("android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java","utf8");
const topology=readFileSync("android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java","utf8");
describe("native fold observer callback safety",()=>{
 it("does not apply fold evidence on WindowManager/Android MAIN",()=>{
  const observe=java.slice(java.indexOf("public static void observeFoldDuringRecording("),java.indexOf("public static void setDirectPreviewTexture("));
  expect(observe).toContain("final int foldObserved = recordingFoldObservations;");
  expect(observe).toContain("STATE_WRITER.execute(() ->");
  expect(observe).toContain('putInt("foldObservations",foldObserved)');
  expect(observe).not.toContain('putInt("foldObservations",recordingFoldObservations)');
 });
 it("keeps both observer-lease gap writes on the serial writer",()=>{
  const leases=java.slice(java.indexOf("public static void observeFoldObserverActive("),java.indexOf("public static void observeFoldDuringRecording("));
  expect((leases.match(/STATE_WRITER\.execute\(\(\) ->/g)||[]).length).toBe(2);
 });
 it("notifies Capacitor after releasing the observer monitor",()=>{
  const callback=topology.slice(topology.indexOf("listener = info -> {"),topology.indexOf("activeOwners.add(ownerId);",topology.indexOf("listener = info -> {")));
  const unlock=callback.indexOf("if (pendingTopologyNotification != null)");
  expect(unlock).toBeGreaterThan(callback.indexOf("pendingTopologyNotification = snapshot();"));
  expect(callback.slice(unlock)).toContain('notifyListeners("topologyChanged", pendingTopologyNotification)');
  expect(callback).toContain("JSObject pendingTopologyNotification = null;");
 });
});
