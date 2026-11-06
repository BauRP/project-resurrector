import {describe,it,expect} from "vitest";
import {readFileSync} from "node:fs";
// Source-level Android contract: physical fold hardware verification separate.
const code=readFileSync("android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java","utf8");
describe("native WindowManager hinge safety gate",()=>{
 it("refuses impossible separating hinge bounds or an unmeasured Activity window",()=>{
  for(const token of ["final int windowWidth=decor==null?0:decor.getWidth();",
   "final int windowHeight=decor==null?0:decor.getHeight();",
   "windowWidth<=0||windowHeight<=0", "hinge.left<0||hinge.top<0",
   "hinge.right>windowWidth||hinge.bottom>windowHeight"]){
    expect(code).toContain(token);
  }
  expect(code).toContain("nextHinges.add(new Rect(Integer.MIN_VALUE/4,");
  expect(code).toContain("if(Rect.intersects(rect,hinge))return true;");
 });
 it("treats excessive OEM hinge feature streams as unknown and unsafe",()=>{
  expect(code).toContain("private static final int MAX_FOLD_FEATURES=32;");
  expect(code).toContain("if(layout.getDisplayFeatures().size()>MAX_FOLD_FEATURES)");
  expect(code).toContain('result.put("source","android-windowmanager-feature-overflow")');
  expect(code).toContain("nextHinges.add(new Rect(Integer.MIN_VALUE/4,");
 });
 it("rejects a zero-size native preview target",()=>{
  expect(code).toContain("if(rect==null||rect.width()<=0||rect.height()<=0)return true;");
 });
 it("blocks stale native TextureView placement when the actual Activity window shrinks",()=>{
  expect(code).toContain("private static int surfaceWindowWidth=0, surfaceWindowHeight=0;");
  expect(code).toContain("surfaceWindowWidth=windowWidth;surfaceWindowHeight=windowHeight;");
  expect(code).toContain("changed=windowChanged || !surfaceTopologyObserved ||");
  expect(code).toContain("rect.right>surfaceWindowWidth||rect.bottom>surfaceWindowHeight");
  expect(code).toContain("surfaceWindowWidth=0;surfaceWindowHeight=0;");
 });
 it("returns unknown topology for an Activity lost during a display handoff",()=>{
  expect(code).toContain('if(host==null||host.isDestroyed()){');
  expect(code).toContain('result.put("source","android-activity-unavailable")');
  expect(code).toContain('call.reject("Fold Activity unavailable")');
  expect(code).toContain("WindowInfoTracker.getOrCreate(host)");
  expect(code).toContain("adapter.addWindowLayoutInfoListener(host, main, listener)");
 });
 it("does not invent folds and maintains native observer leases",()=>{
  expect(code).toContain("if(!fold.isSeparating())continue;");
  expect(code).toContain("if(!lease.equals(surfaceLease))return;");
  expect(code).toContain("updateSurfaceHinges(lease,info)");
 });
});
