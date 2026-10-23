import { describe, expect, it } from "vitest";
import { isDecodedFirstFrame } from "./clip-playback";

describe("decoded video proof", () => {
  it("never accepts loaded metadata alone", () => {
    expect(isDecodedFirstFrame(1, 1920, 1080)).toBe(false);
    expect(isDecodedFirstFrame(0, 1920, 1080)).toBe(false);
  });
  it("requires a real positive decoded image size", () => {
    expect(isDecodedFirstFrame(2, 1920, 1080)).toBe(true);
    expect(isDecodedFirstFrame(4, 1280, 720)).toBe(true);
    expect(isDecodedFirstFrame(2, 0, 1080)).toBe(false);
    expect(isDecodedFirstFrame(3, Number.NaN, 1080)).toBe(false);
    expect(isDecodedFirstFrame(3, 1920, -10)).toBe(false);
  });
});
