import { expect, describe, it } from "vitest";
import { independentStreamsReady, isCleanDualRecording, compareDualFileDurations } from "./dual-live-recording";
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

describe("honest two-encoder result status", () => {
  const good = { playable: 2, startedConfirmed: true, failures: 0, endedUnexpectedly: false, stopReason: "" };
  it("only accepts two decoded clips and two actual encoder start events", () => {
    expect(isCleanDualRecording(good)).toBe(true);
    expect(isCleanDualRecording({ ...good, playable: 1 })).toBe(false);
    expect(isCleanDualRecording({ ...good, startedConfirmed: false })).toBe(false);
  });
  it("flags background interruption, encoder failures and unexpected stream ends", () => {
    expect(isCleanDualRecording({ ...good, stopReason: "background" })).toBe(false);
    expect(isCleanDualRecording({ ...good, failures: 1 })).toBe(false);
    expect(isCleanDualRecording({ ...good, endedUnexpectedly: true })).toBe(false);
  });
});


describe("dual recording file duration evidence", () => {
  it("reports unknown when WebView cannot expose a reliable duration", () => {
    expect(compareDualFileDurations(null, 20)).toBe("unknown");
    expect(compareDualFileDurations(0, 20)).toBe("unknown");
    expect(compareDualFileDurations(1, 2)).toBe("unknown");
    expect(compareDualFileDurations(Number.NaN, 20)).toBe("unknown");
  });
  it("flags large asymmetric truncation without claiming frame synchronization", () => {
    expect(compareDualFileDurations(60, 12)).toBe("mismatch");
    expect(compareDualFileDurations(60, 58)).toBe("consistent");
  });
});
