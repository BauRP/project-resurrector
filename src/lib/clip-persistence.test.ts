import { describe, expect, it } from "vitest";
import { persistedClipMatches } from "./clip-persistence";

describe("video persistence evidence", () => {
  const blob = new Blob([new Uint8Array(2048)], { type: "video/webm" });
  const expected = { id: "real-clip-id", blob };
  it("accepts read-back of the same video ID, size and MIME type", () => {
    expect(persistedClipMatches(expected, { ...expected })).toBe(true);
  });
  it("rejects missing or corrupted saved media without deleting original blobs", () => {
    expect(persistedClipMatches(expected, null)).toBe(false);
    expect(persistedClipMatches(expected, { ...expected, id: "different" })).toBe(false);
    expect(persistedClipMatches(expected, { ...expected, blob: new Blob([new Uint8Array(100)], { type: "video/webm" }) })).toBe(false);
    expect(persistedClipMatches(expected, { ...expected, blob: new Blob([new Uint8Array(2048)], { type: "video/mp4" }) })).toBe(false);
  });
});
