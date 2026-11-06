import { describe, expect, it, vi } from "vitest";
import { createMulticamStore } from "../lib/multicam-store";
import { focusPoint, focusSupport, cameraController } from "../lib/camera-controller";
import { timelineMinZoom, timelineTime, visibleTiles } from "../lib/timeline";
import { initialTrackCounts, trackReducer, trackLanes, timelineContentWidth, pinnedPlayhead } from "../lib/timeline-tracks";
import { KNOB_DEFAULT, KNOB_MAX, knobToGain, knobToCeiling } from "../components/multicam/CameraPro";

describe("mandated studio rules", () => {
  it("preserves site video/audio default lanes and real add-track state", () => {
    expect(trackLanes(initialTrackCounts).map(x => x.key)).toEqual(["v1","a1"]);
    const video = trackReducer(initialTrackCounts,{type:"add",kind:"video"});
    const audio = trackReducer(video,{type:"add",kind:"audio"});
    expect(audio).toEqual({video:2,audio:2});
    expect(trackLanes(audio).map(x => x.key)).toEqual(["v1","v2","a1","a2"]);
    expect(trackReducer(audio,{type:"set",kind:"video",value:1}).video).toBe(1);
  });
  it("keeps 0s playhead locked to timeline origin without extra scrolling", () => {
    expect(pinnedPlayhead(0, 20, 240, 104)).toBe(104);
    expect(pinnedPlayhead(-10, 20, 500, 104)).toBe(104);
    expect(pinnedPlayhead(5, 20, 250, 104)).toBe(204);
    expect(timelineContentWidth(360,104,0,20)).toBe(360);
    expect(timelineContentWidth(360,104,40,20)).toBe(912);
  });
  it("keeps actions stable and does not notify for unchanged theme", () => {
    const store = createMulticamStore(); const before = store.getSnapshot(); const notify = vi.fn(); store.subscribe(notify);
    before.set({ theme: "light" }); expect(notify).not.toHaveBeenCalled();
    before.set({ theme: "dark" }); expect(notify).toHaveBeenCalledTimes(1); expect(store.getSnapshot().set).toBe(before.set);
  });
  it("does not infer unsupported focus from missing capability data", () => {
    expect(focusSupport({})).toBe("unknown");
    expect(focusSupport({ focusMode: ["continuous"] })).toBe("unsupported");
    expect(focusSupport({ focusDistance: { min: 0, max: 10 } })).toBe("supported");
  });
  it("maps taps through cover cropping to source coordinates", () => {
    expect(focusPoint({ left: 0, top: 0, width: 100, height: 100 }, 200, 100, 0, 50)).toEqual({ x: 0.25, y: 0.5 });
  });
  it("locks timeline time at zero and fits an empty timeline", () => {
    expect(timelineTime(-100, 8, 10)).toBe(0);
    expect(timelineMinZoom(400, 10)).toBe(32);
  });
  it("renders only viewport tiles with one tile of buffering", () => {
    expect(visibleTiles(0, 64000, 640, 320)).toEqual({ first: 9, end: 16 });
  });
  it("gain starts at 18 within a 0–24 scale with a matching ceiling", () => {
    expect(KNOB_DEFAULT).toBe(18); expect(KNOB_MAX).toBe(24);
    expect(knobToGain(18)).toBe(1); expect(knobToGain(0)).toBe(0); expect(knobToCeiling(18)).toBe(-15);
  });
  it("never applies a second camera's commands to the first track", async () => {
    const applyA = vi.fn().mockResolvedValue(undefined); const applyB = vi.fn().mockResolvedValue(undefined);
    const a = { getVideoTracks: () => [{ readyState: "live", applyConstraints: applyA }] } as unknown as MediaStream;
    const b = { getVideoTracks: () => [{ readyState: "live", applyConstraints: applyB }] } as unknown as MediaStream;
    await Promise.all([cameraController.apply(a, { zoom: 2 }), cameraController.apply(b, { zoom: 3 })]);
    expect(applyA).toHaveBeenCalledWith({ advanced: [{ zoom: 2 }] }); expect(applyB).toHaveBeenCalledWith({ advanced: [{ zoom: 3 }] });
  });
});