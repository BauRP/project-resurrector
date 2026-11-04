import { beforeEach, describe, expect, it } from "vitest";
import { emptyCapabilityMatrix, loadMatrix } from "./capabilities";

const KEY = "multicam-capability-matrix";
beforeEach(() => localStorage.clear());

describe("camera passport recovery after Android WebView restart", () => {
  it("rejects partial, null and oversized saved camera passports without crashing", () => {
    for (const value of ["null", "{}", "{oops", JSON.stringify({permissions:{camera:"granted"}}), "x".repeat(262145)]) {
      localStorage.setItem(KEY,value);
      expect(loadMatrix()).toBeNull();
    }
  });
  it("accepts the complete camera passport, leaving permissions and modes intact", () => {
    const matrix=emptyCapabilityMatrix({camera:"not-requested",microphone:"not-requested",storage:"unavailable"});
    localStorage.setItem(KEY,JSON.stringify(matrix));
    expect(loadMatrix()).toEqual(matrix);
  });
  it("does not delete invalid user data or open a sensor while recovering", () => {
    localStorage.setItem(KEY,'{"rear":{"available":true}}');
    expect(loadMatrix()).toBeNull();
    expect(localStorage.getItem(KEY)).toBe('{"rear":{"available":true}}');
  });
});
