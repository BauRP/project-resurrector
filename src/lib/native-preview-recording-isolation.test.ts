import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const service=readFileSync("android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java","utf8");
describe("Camera2 preview-only sessions never masquerade as MP4 captures",()=>{
 it("distinguishes ACTION_PREVIEW from an accepted ACTION_START",()=>{
  expect(service).toContain("private boolean recordingAttemptStarted;");
  expect(service).toContain("recordingAttemptStarted=true;");
  expect(service).toContain("recordingAttemptStarted=false;");
 });
 it("handles a preview Camera2 error before media finalization, even with an open camera",()=>{
  const start=service.indexOf("private void finish()");
  const end=service.indexOf("private static String publishVideo",start);
  const finish=service.slice(start,end);
  const guard=finish.indexOf("if (!recordingAttemptStarted && encoder == null)");
  const finalized=finish.indexOf("boolean previouslyRecording = encoderStarted");
  expect(guard).toBeGreaterThan(0);
  expect(finalized).toBeGreaterThan(guard);
  expect(finish.slice(guard,finalized)).toContain("releaseCamera();");
  expect(finish.slice(guard,finalized)).toContain('if(!"error".equals(state))');
  expect(finish.slice(guard,finalized)).toContain("return;");
 });
 it("never overwrites durable MP4 audit with a later preview-only failure",()=>{
  expect(service).toContain('if ("error".equals(state) && recordingAttemptStarted)');
  const start=service.indexOf("private void startPreview(Intent intent)");
  const end=service.indexOf("private void rebindPreviewOutput()",start);
  expect(service.slice(start,end)).toContain("selectedWidth=0;selectedHeight=0;selectedFps=0;");
 });
});
