import { expect, describe, it } from "vitest";
import { independentStreamsReady } from "./dual-live-recording";
const track = (id: string, state: "live"|"ended"="live") =>
  ({readyState:state, getSettings:()=>({deviceId:id})}) as unknown as MediaStreamTrack;
const stream = (t: MediaStreamTrack) =>
  ({getVideoTracks:()=>[t]}) as unknown as MediaStream;
describe("dual live capture readiness", () => {
  it("rejects duplicate, missing and ended device tracks", () => {
    const a=track("main"), b=track("main"), c=track("secondary","ended");
    expect(independentStreamsReady(stream(a),stream(b))).toBe(false);
    expect(independentStreamsReady(stream(a),stream(c))).toBe(false);
    expect(independentStreamsReady(stream(a),null)).toBe(false);
  });
  it("requires two different live WebView device IDs", () => {
    expect(independentStreamsReady(stream(track("main")),stream(track("front")))).toBe(true);
    expect(independentStreamsReady(stream(track("")),stream(track("front")))).toBe(false);
  });
});
