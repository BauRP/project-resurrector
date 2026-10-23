import { describe, expect, it } from "vitest";
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
