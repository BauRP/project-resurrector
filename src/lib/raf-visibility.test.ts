import { describe, expect, it } from "vitest";
import { responsiveHiddenFrameGuard } from "./raf-visibility";

describe("Astra false-hidden Android GPU visibility guard", () => {
  it("blocks slow background frame callbacks", () => {
    const active = responsiveHiddenFrameGuard(350, 3);
    expect(active(100, true)).toBe(false);
    expect(active(1100, true)).toBe(false);
    expect(active(2100, true)).toBe(false);
  });
  it("retains false-color features on a falsely hidden yet painting WebView", () => {
    const active = responsiveHiddenFrameGuard(350, 3);
    expect(active(100, true)).toBe(false);
    expect(active(116, true)).toBe(false);
    expect(active(132, true)).toBe(true);
  });
  it("resets after sparse callbacks and allows ordinary foreground", () => {
    const active = responsiveHiddenFrameGuard(350, 3);
    expect(active(10, false)).toBe(true);
    expect(active(1000, true)).toBe(false);
    expect(active(1016, true)).toBe(false);
    expect(active(1032, true)).toBe(true);
    expect(active(1050, false)).toBe(true);
  });
});
