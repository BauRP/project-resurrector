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
  expect(panel).toContain("const latest=document.hidden?null:measure();");
  expect(panel).toContain("viewportWidth:viewport.width,viewportHeight:viewport.height");
  expect(panel).toContain("lastViewport?.width===viewport.width");
  expect(panel).toContain("lastViewport?.height===viewport.height");
 });
 it("video survives denied microphone permission with an explicit silent capture choice",()=>{
  expect(panel).toContain('if(result["camera"]!=="granted")');
  expect(panel).toContain('if(audio&&!recordAudio)');
  expect(panel).toContain('setAudio(false)');
  expect(panel).toContain('audio:recordAudio');
  expect(panel).not.toContain('if(result["camera"]!=="granted"||(audio&&');
 });
 it("folding only invalidates the preview surface, never stops the Camera2 recorder",()=>{
  const start=panel.indexOf("const folding=()=>");
  const end=panel.indexOf('window.addEventListener("resize"',start);
  expect(start).toBeGreaterThan(0);
  const callback=panel.slice(start,end);
  expect(callback).not.toContain("hide().then(");
  expect(callback).toContain("sync()");
  expect(callback).not.toMatch(/bridge\.(stop|pause|start)\(/);
 });
});
