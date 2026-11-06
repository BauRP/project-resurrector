import { describe, expect, it } from "vitest";
import { isCameraSwitchBlocked } from "./camera-device-switch";
describe("camera device ownership during recording", () => {
  it("holds the active camera from startup until persistence completes", () => {
    for (const phase of ["starting", "recording", "stopping", "saving"] as const) {
      expect(isCameraSwitchBlocked(false, phase)).toBe(true);
    }
    expect(isCameraSwitchBlocked(true, "idle")).toBe(true);
  });
  it("allows a queued selection after successful save or reported failure", () => {
    expect(isCameraSwitchBlocked(false, "saved")).toBe(false);
    expect(isCameraSwitchBlocked(false, "error")).toBe(false);
    expect(isCameraSwitchBlocked(false, "idle")).toBe(false);
  });
});
