import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

/** Regression contracts for production Camera2/WindowManager interaction.
 * Physical fold acceptance is deliberately NOT claimed by these tests.
 */
const panel=readFileSync(resolve(process.cwd(),"src/components/multicam/NativeRecordingPanel.tsx"),"utf8");

describe("Camera2 preview during Android fold transitions",()=>{
 it("never conditionally skips hooks on WebView-only builds",()=>{
  const guard=panel.lastIndexOf("if(!isNative())return null;");
  expect(guard).toBeGreaterThan(panel.indexOf("const [encoderSupport,setEncoderSupport]"));
  expect(guard).toBeGreaterThan(panel.indexOf("const mode=validNativeSelection"));
  expect(guard).toBeGreaterThan(panel.lastIndexOf("useEffect(()=>"));
  expect(panel.substring(guard)).not.toContain("useEffect(()=>");
 });
 it("rechecks current Android overlay dimensions inside the serialized operation",()=>{
  expect(panel).toContain("const measure=()=>nativePreviewSnapshot(");
  expect(panel).toContain("const latest=document.hidden||!(await safePreviewState())?null:measure();");
  expect(panel).toContain('return current.state==="previewing"');
  expect(panel).toContain("viewportWidth:viewport.width,viewportHeight:viewport.height");
  expect(panel).toContain("lastViewport?.width===viewport.width");
  expect(panel).toContain("lastViewport?.height===viewport.height");
 });
 it("retries once Camera2 asynchronously reaches previewing after panel mount",()=>{
  expect(panel).toContain('if(status?.state==="previewing")');
  expect(panel).toContain('window.dispatchEvent(new Event("multicam-native-preview-ready"))');
  expect(panel).toContain('window.addEventListener("multicam-native-preview-ready",resized)');
  expect(panel).toContain('window.removeEventListener("multicam-native-preview-ready",resized)');
 });
 it("retains the user's direct-preview preference when starting actual recording",()=>{
  const start=panel.slice(panel.indexOf("const start=async()=>"),panel.indexOf("const stop=async()=>"));
  expect(start).toContain("bridge.setDirectPreview({ownerId:directLease.current,visible:false})");
  expect(start).not.toContain("setDirectEnabled(false)");
  expect(panel).toContain('localStorage.setItem("multicam-native-direct-preview-v1"');
 });
 it("uses actual Camera2 frames during native recording even if direct preview was selected",()=>{
  expect(panel).toContain('const directSurfaceVisible=directEnabled&&status?.state==="previewing"');
  expect(panel).toContain("status.directPreviewActive===true");
  expect(panel).toContain(': preview');
  expect(panel).toContain("MP4 записывается на Android. Реальный контрольный кадр пока недоступен");
 });
 it("video survives denied microphone permission with an explicit silent capture choice",()=>{
  expect(panel).toContain('if(result["camera"]!=="granted")');
  expect(panel).toContain('if(audio&&!recordAudio)');
  expect(panel).toContain('setAudio(false)');
  expect(panel).toContain('audio:recordAudio');
  expect(panel).not.toContain('if(result["camera"]!=="granted"||(audio&&');
 });
 it("restores after native safety invalidation once per fold epoch without restarting capture",()=>{
  expect(panel).toContain('bridge.addListener("directPreviewInvalidated",event=>');
  expect(panel).toContain('if(!live||event.ownerId!==ownerId)return;');
  expect(panel).toContain('if(recoveringEpoch===foldEpoch)return;');
  expect(panel).toContain('recoveringEpoch=foldEpoch;');
  expect(panel).toContain('if(invalidationHandle)void invalidationHandle.remove()');
  const invalidate=panel.slice(panel.indexOf('bridge.addListener("directPreviewInvalidated"'),panel.indexOf('const observer=typeof ResizeObserver'));
  expect(invalidate).not.toContain("bridge.stop()");
 });
 it("coalesces repeated scroll/hinge sync requests without queued stale preview placements",()=>{
   expect(panel).toContain("let syncRunning=false,syncDirty=false");
   expect(panel).toContain("if(syncRunning){syncDirty=true;return;}");
   expect(panel).toContain("await syncOnce()");
   expect(panel).toContain("while(live&&syncDirty)");
   expect(panel).toContain("const latest=document.hidden||!(await safePreviewState())?null:measure()");
 });
 it("folding only invalidates the preview surface, never stops the Camera2 recorder",()=>{
  const start=panel.indexOf("const folding=()=>");
  const end=panel.indexOf('window.addEventListener("resize"',start);
  expect(start).toBeGreaterThan(0);
  const callback=panel.slice(start,end);
  expect(callback).not.toContain("hide().then(");
  expect(callback).toContain("sync()");
  expect(callback).toContain("foldPreviewTopologySignature(getActiveFoldBaseline())");
  expect(callback).toContain("foldEpoch++");
  expect(panel).toContain("lastShownFoldEpoch===submittedFoldEpoch");
  expect(panel).toContain("lastShownFoldEpoch=lastVisible?submittedFoldEpoch:-1");
  expect(panel).toContain("lastVisible=acknowledged?.visible===true");
  expect(callback).not.toMatch(/bridge\.(stop|pause|start)\(/);
 });
});
