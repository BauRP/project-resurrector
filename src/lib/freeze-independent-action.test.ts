import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
describe("native freeze report retains last navigation action without waiting for plugin queue",()=>{
 it("stores only a capped in-memory breadcrumb and reads it independently",()=>{
  const action=readFileSync("src/lib/freeze-action-trace.ts","utf8");
  const monitor=readFileSync("android/app/src/main/java/app/lovable/multicampov/UiFreezeMonitor.java","utf8");
  expect(action).toContain("__multicamFreezeLastAction = action.slice(0, 96)");
  expect(monitor).toContain("document.documentElement.dataset.activeMulticamTab");
  expect(monitor).toContain("window.__multicamFreezeLastAction");
  expect(monitor).toContain("Independent renderer evidence:");
  expect(monitor).toContain("Math.min(240, value.length())");
 });
});
