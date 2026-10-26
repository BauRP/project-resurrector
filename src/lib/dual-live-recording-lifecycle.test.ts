import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { salvageBufferedEncoderChunks, startDualRecording } from "./dual-live-recording";
import { readPersistedClip, saveRecordedClipsAtomically } from "./clip-persistence";
import { verifyDecodedVideoBlob } from "./clip-playback";
import { FOLD_EVENT } from "./fold-recording-evidence";

vi.mock("./clip-persistence", () => ({
  saveRecordedClipsAtomically: vi.fn(async () => undefined),
  readPersistedClip: vi.fn(async (id: string) => ({
    id, blob: new Blob(["x".repeat(2048)], { type: "video/webm" }),
  })),
}));
vi.mock("./clip-playback", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./clip-playback")>()),
  verifyDecodedVideoBlob: vi.fn(async () => ({
    verifiedFirstFrame: true, width: 1280, height: 720,
    durationSeconds: null,
  })),
}));

class MockRecorder {
  static instances: MockRecorder[] = [];
  static isTypeSupported = (_mime: string) => true;
  static stallIndex: number | null = null;
  static skipStartIndex: number | null = null;
  state: RecordingState = "inactive";
  mimeType: string;
  onstart: (() => void) | null = null;
  onstop: (() => void) | null = null;
  ondataavailable: ((event: {data: Blob}) => void) | null = null;
  onerror: ((event: Event & { error?: Error }) => void) | null = null;
  constructor(_stream: MediaStream, options: MediaRecorderOptions) {
    this.mimeType = options.mimeType ?? "video/webm";
    MockRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
    if (MockRecorder.instances.indexOf(this) !== MockRecorder.skipStartIndex) this.onstart?.();
  }
  stop() {
    if (this.state === "inactive") return;
    this.state = "inactive";
    this.ondataavailable?.({data: new Blob(["x".repeat(2048)], {type:this.mimeType})});
    if (MockRecorder.instances.indexOf(this) !== MockRecorder.stallIndex) this.onstop?.();
  }
  fail() {
    this.onerror?.({type:"error", error:new Error("simulated encoder failure")} as Event & {error:Error});
  }
}
function camera(id: string) {
  const track = new EventTarget() as MediaStreamTrack;
  Object.defineProperty(track, "readyState", {value:"live"});
  Object.defineProperty(track, "getSettings", {configurable:true,value:()=>({deviceId:id})});
  Object.defineProperty(track, "kind", {value:"video"});
  // MediaStream.getTracks() is part of the real browser API. A mock omitting
  // it masked source track termination logic and blocked the entire APK CI.
  const stream = {
    getVideoTracks:()=>[track], getAudioTracks:()=>[],
    getTracks:()=>[track],
  } as unknown as MediaStream;
  return {track, stream};
}

beforeEach(() => {
  MockRecorder.instances = [];
  MockRecorder.stallIndex = null;
  MockRecorder.skipStartIndex = null;
  vi.clearAllMocks();
  vi.stubGlobal("MediaRecorder", MockRecorder);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("two live MediaRecorder lifecycle recovery", () => {
  it("saves two separately decoded clips and does not claim hardware synchronization", async () => {
    const one=camera("rear"), two=camera("front");
    const started=vi.fn();
    const session=startDualRecording(one.stream,two.stream,started);
    expect(MockRecorder.instances).toHaveLength(2);
    expect(started).toHaveBeenCalledTimes(1);
    session.stop();
    const result=await session.done;
    expect(result.savedIds).toHaveLength(2);
    expect(result.paired).toBe(true);
    expect(saveRecordedClipsAtomically).toHaveBeenCalledTimes(1);
    expect(readPersistedClip).toHaveBeenCalledTimes(2);
    expect(verifyDecodedVideoBlob).toHaveBeenCalledTimes(2);
    const clips=vi.mocked(saveRecordedClipsAtomically).mock.calls[0]![0];
    expect(clips.map(c=>c.cameraDeviceId)).toEqual(["rear","front"]);
    expect(clips.every(c=>c.synchronizationVerified===false)).toBe(true);
  });
  it("keeps the original camera ID even if driver getSettings fails during finalization", async () => {
    const one=camera("rear"), two=camera("front");
    const session=startDualRecording(one.stream,two.stream,vi.fn());
    Object.defineProperty(one.track,"getSettings",{value:()=>{throw new Error("camera disconnected");}});
    one.track.dispatchEvent(new Event("ended"));
    const result=await session.done;
    expect(result.savedIds).toHaveLength(2);
    expect(result.paired).toBe(false);
    const clips=vi.mocked(saveRecordedClipsAtomically).mock.calls[0]![0];
    expect(clips.map(c=>c.cameraDeviceId)).toEqual(["rear","front"]);
  });
  it("treats unreadable camera IDs as unverified instead of crashing", () => {
    const one=camera("rear"), two=camera("front");
    Object.defineProperty(one.track,"getSettings",{value:()=>{throw new Error("camera busy");}});
    expect(() => startDualRecording(one.stream,two.stream,vi.fn())).toThrow("Две разные одновременно активные камеры");
  });
  it("keeps the first interruption cause when later stop events arrive", async () => {
    const one=camera("rear"), two=camera("front");
    const session=startDualRecording(one.stream,two.stream,vi.fn());
    one.track.dispatchEvent(new Event("ended"));
    session.stop("Экран закрыт");
    const result=await session.done;
    expect(result.paired).toBe(false);
    expect(result.message).toContain("Видеопоток потерян");
    expect(result.message).not.toContain("Экран закрыт");
  });
  it("preserves clips but reports interruption after actual camera track loss", async () => {
    const one=camera("rear"), two=camera("front");
    const session=startDualRecording(one.stream,two.stream,vi.fn());
    one.track.dispatchEvent(new Event("ended"));
    const result=await session.done;
    expect(result.savedIds).toHaveLength(2);
    expect(result.paired).toBe(false);
    expect(result.message).toContain("Видеопоток потерян");
  });
  it("salvages available data without claiming a clean pair when an encoder errors", async () => {
    const one=camera("rear"), two=camera("front");
    const session=startDualRecording(one.stream,two.stream,vi.fn());
    MockRecorder.instances[0]!.fail();
    const result=await session.done;
    expect(result.savedIds).toHaveLength(2);
    expect(result.paired).toBe(false);
    expect(result.message).toContain("видеокодировщик отказал");
  });
  it("retains bounded true fold events in saved clips without declaring continuity", async () => {
    const one=camera("rear"), two=camera("front");
    const session=startDualRecording(one.stream,two.stream,vi.fn());
    window.dispatchEvent(new CustomEvent(FOLD_EVENT,{detail:{
      revision:3,posture:"HALF_OPENED",hingeCount:1,usableRegions:2,layout:"vertical",
    }}));
    session.stop();
    await session.done;
    const clips=vi.mocked(saveRecordedClipsAtomically).mock.calls[0]![0];
    expect(clips[0]?.foldTransitions).toHaveLength(1);
    expect(clips[0]?.foldContinuityVerified).toBe(false);
  });
  it("rejects failed persistence and does not leave old recording event handlers active", async () => {
    vi.mocked(saveRecordedClipsAtomically).mockRejectedValueOnce(new Error("disk full"));
    const one=camera("rear"),two=camera("front");
    const session=startDualRecording(one.stream,two.stream,vi.fn());
    session.stop();
    await expect(session.done).rejects.toThrow("disk full");
    // After completion, a delayed track-ended event cannot issue new stop requests.
    one.track.dispatchEvent(new Event("ended"));
  });
});

describe("stalled encoder salvage policy", () => {
  it("keeps already emitted bytes but rejects short or empty media", () => {
    expect(salvageBufferedEncoderChunks([], "video/webm")).toBe(null);
    expect(salvageBufferedEncoderChunks([new Blob(["a"])], "video/webm")).toBe(null);
    expect(salvageBufferedEncoderChunks([new Blob(["x".repeat(2048)])], "video/webm")?.size).toBe(2048);
  });
  it("saves available bytes after a recorder fails to issue onstop, without a clean success claim", async () => {
    vi.useFakeTimers();
    MockRecorder.stallIndex = 1;
    const a = camera("rear"), b = camera("front");
    const session = startDualRecording(a.stream, b.stream, vi.fn());
    session.stop();
    await vi.advanceTimersByTimeAsync(12_010);
    const result = await session.done;
    expect(result.savedIds).toHaveLength(2);
    expect(result.paired).toBe(false);
    expect(result.message).toContain("не завершился");
    expect(saveRecordedClipsAtomically).toHaveBeenCalledTimes(1);
  });
});

describe("independent camera startup watchdog", () => {
  it("does not force-stop healthy two-camera capture after eight seconds", async () => {
    vi.useFakeTimers();
    const a=camera("rear"), b=camera("front");
    const started=vi.fn();
    const session=startDualRecording(a.stream,b.stream,started);
    expect(started).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(MockRecorder.instances.every(r=>r.state==="recording")).toBe(true);
    expect(saveRecordedClipsAtomically).not.toHaveBeenCalled();
    session.stop();
    const result=await session.done;
    expect(result.paired).toBe(true);
    expect(result.savedIds).toHaveLength(2);
  });
  it("salvages second-camera encoded bytes even without its onstart callback", async () => {
    vi.useFakeTimers();
    MockRecorder.skipStartIndex=1;
    const a=camera("rear"), b=camera("front");
    const session=startDualRecording(a.stream,b.stream,vi.fn());
    await vi.advanceTimersByTimeAsync(8001);
    const result=await session.done;
    expect(result.savedIds).toHaveLength(2);
    expect(result.paired).toBe(false);
    const clips=vi.mocked(saveRecordedClipsAtomically).mock.calls[0]![0];
    expect(clips.map(clip=>clip.cameraDeviceId)).toEqual(["rear","front"]);
  });
  it("ends and truthfully reports incomplete startup when a second onstart never arrives", async () => {
    vi.useFakeTimers();
    MockRecorder.skipStartIndex=1;
    const a=camera("rear"), b=camera("front");
    const started=vi.fn();
    const session=startDualRecording(a.stream,b.stream,started);
    expect(started).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8001);
    const result=await session.done;
    expect(result.paired).toBe(false);
    expect(result.message).toContain("8 секунд");
    expect(MockRecorder.instances.every(r=>r.state==="inactive")).toBe(true);
  });
});
