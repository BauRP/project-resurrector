import { describe, expect, it } from "vitest";
import { persistedClipMatches, sampledClipBytesMatch } from "./clip-persistence";

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

describe("bounded persisted-byte sampling (not full-file integrity)", () => {
  const payload = new Uint8Array(8192).map((_, index) => index % 251);
  const media = (data: Uint8Array) => new Blob([data.slice().buffer], {type:"video/webm"});
  it("accepts equal bytes without loading an entire long video", async () => {
    expect(await sampledClipBytesMatch(media(payload),media(payload))).toBe(true);
  });
  it("detects same-sized corruption in middle, start and end samples", async () => {
    for (const at of [0, 4096, 8191]) {
      const changed = payload.slice(); changed[at] ^= 0xff;
      expect(await sampledClipBytesMatch(media(payload),media(changed))).toBe(false);
    }
  });
  it("does not accept matching bytes with a different media MIME", async () => {
    expect(await sampledClipBytesMatch(media(payload),new Blob([payload.slice().buffer],{type:"video/mp4"}))).toBe(false);
  });
});
