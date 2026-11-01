import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canTestDualDevices } from "./dual-camera-verification";
describe("dual camera eligibility", () => {
  it("refuses duplicate or unselected camera IDs", () => {
    expect(canTestDualDevices("a", "a")).toBe(false);
    expect(canTestDualDevices("", "b")).toBe(false);
    expect(canTestDualDevices("a", "")).toBe(false);
  });
  it("only accepts distinct WebView camera device IDs", () => {
    expect(canTestDualDevices("back", "front")).toBe(true);
  });
});

describe("dual camera runtime evidence is not inferred from requests",()=>{
 it("requires that both actual getSettings device identities equal the requested cameras",()=>{
  const source=readFileSync("src/lib/dual-camera-verification.ts","utf8");
  expect(source).toContain("settings[0]?.deviceId !== firstId");
  expect(source).toContain("settings[1]?.deviceId !== secondId");
 });
});
