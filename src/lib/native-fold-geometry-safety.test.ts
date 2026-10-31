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
 it("rejects a zero-size native preview target",()=>{
  expect(code).toContain("if(rect==null||rect.width()<=0||rect.height()<=0)return true;");
 });
 it("does not invent folds and maintains native observer leases",()=>{
  expect(code).toContain("if(!fold.isSeparating())continue;");
  expect(code).toContain("if(!lease.equals(surfaceLease))return;");
  expect(code).toContain("updateSurfaceHinges(lease,info)");
 });
});
