import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
// These guard Java source contracts; physical-device acceptance is separate.
const dir="android/app/src/main/java/app/lovable/multicampov/";
const service=readFileSync(dir+"NativeCaptureService.java","utf8");
const plugin=readFileSync(dir+"NativeCapturePlugin.java","utf8");
describe("Camera2 queued controls and fold preview lifecycle",()=>{
 it("does not run queued commands from an old capture generation",()=>{
  expect(service).toContain("private boolean acceptsQueuedControl(int expectedGeneration)");
  expect(service).toContain("runningInstance==this && generation==expectedGeneration");
  expect(service).toContain("private volatile int generation = 0;");
  expect(service.match(/final int commandGeneration=owner\.generation;/g)).toHaveLength(4);
  for(const fn of ["applyControls(zoom,evIndex)","applyTorch(enabled)","applyFocus(manual,diopters)","applyTapToMeter(x,y)"]){
   expect(service).toContain("completed.accept(current && owner."+fn+");");
  }
 });
 it("does not apply stale preview commands after a physical fold",()=>{
  expect(service.match(/final int commandPreviewRevision=owner\.previewSessionRevision;/g)).toHaveLength(3);
  expect(service.match(/owner\.previewSessionRevision==commandPreviewRevision;/g)).toHaveLength(3);
 });
 it("cleans up direct preview even when Android Activity was already detached",()=>{
  expect(plugin).toContain("new Handler(Looper.getMainLooper()).post(this::detachDirectView);");
  expect(plugin).toContain("if(getActivity()!=host||host.isDestroyed()||host.isFinishing())");
  expect(plugin).not.toContain("getActivity().runOnUiThread(this::detachDirectView)");
 });
 it("resubmits previous repeating request when Camera2 rejects zoom, torch or focus",()=>{
  const start=service.indexOf("private boolean restoreRepeatingControlsAfterRejection()");
  const restore=service.slice(start,service.indexOf("private boolean applyControls(",start));
  expect(restore).toContain("setRequestControls(liveRequest);");
  expect(restore).toContain("capture.setRepeatingRequest(liveRequest.build(),liveCallback,worker);");
  expect(restore).toContain("return false;");
  for(const oldSettings of [
    "requestedZoom=previousZoom;requestedExposure=previousEv;",
    "torchEnabled=old;",
    "manualFocus=previousMode;requestedFocusDiopters=previousDistance;"
  ]){
    const i=service.indexOf(oldSettings);
    expect(i).toBeGreaterThan(0);
    expect(service.slice(i,i+170)).toContain("restoreRepeatingControlsAfterRejection()");
  }
  expect(service).toContain("восстановление предыдущей конфигурации не подтверждено");
 });
 it("restores the last repeating Camera2 request after rejected tap metering",()=>{
  const start=service.indexOf("private boolean applyTapToMeter(");
  const end=service.indexOf("public static boolean isRunning()",start);
  const code=service.slice(start,end);
  expect(code).toContain("focusTapX=oldX;focusTapY=oldY;manualFocus=wasManual;");
  expect(code).toContain("boolean restored=restoreRepeatingControlsAfterRejection();");
  expect(code).toContain("восстановление предыдущей конфигурации не подтверждено");
  expect(code).not.toContain("catch(Exception ignored){}");
 });
 it("does not use pre-fold tap locations on a new Camera2 preview surface",()=>{
  const a=service.indexOf("public static boolean tapToMeter(");
  const b=service.indexOf("private boolean applyTapToMeter(",a);
  expect(service.slice(a,b)).toContain("owner.previewSessionRevision==expectedPreviewRevision");
  expect(service).toContain("private volatile int previewSessionRevision = 0;");
 });
 it("rejects invalid preview placement before rounding coordinates",()=>{
  const a=plugin.indexOf("@PluginMethod public void setDirectPreview(");
  const b=plugin.indexOf("@Override protected void handleOnDestroy()",a);
  const code=plugin.slice(a,b);
  expect(code).toContain("x+w>viewportWidth+2.0 || y+h>viewportHeight+2.0");
  expect(code.indexOf("x+w>viewportWidth")).toBeLessThan(code.indexOf("int px=Math.round("));
 });
 it("does not focus through a detached TextureView",()=>{
  expect(plugin).toContain("if(view!=createdView || directView!=createdView ||");
  expect(plugin).toContain("!owner.equals(directOwner))return true;");
 });
});
