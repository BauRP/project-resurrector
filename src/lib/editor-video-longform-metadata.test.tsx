import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { EditorVideoLayer, type EditorVideoLayerProps } from "@/components/multicam/EditorVideoLayer";

const base: EditorVideoLayerProps = {
  source: "blob:long-original",
  timelineTime: 0,
  start: 0,
  inPoint: 0,
  outPoint: 7200,
  speed: 1,
  reverse: false,
  playing: false,
  audioEnabled: true,
  style: {},
  zIndex: 1,
  label: "Длинное видео",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("late WebView metadata never rewinds long editor clips", () => {
  function mount(timelineTime: number) {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    const props = { ...base, timelineTime };
    const ui = render(<EditorVideoLayer {...props} />);
    const video = ui.container.querySelector("video") as HTMLVideoElement;
    expect(video).not.toBeNull();
    return { ui, video };
  }
  it("uses the current 30-minute playhead on a delayed metadata event", () => {
    const { ui, video } = mount(0);
    ui.rerender(<EditorVideoLayer {...base} timelineTime={1800} />);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBeCloseTo(1800);
  });
  it("uses the current 1-hour and 2-hour playheads while the same decoder loads", () => {
    const { ui, video } = mount(5);
    ui.rerender(<EditorVideoLayer {...base} timelineTime={3600} />);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBeCloseTo(3600);
    ui.rerender(<EditorVideoLayer {...base} timelineTime={7190} />);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBeCloseTo(7190);
    expect(video.getAttribute("src")).toBe(base.source);
  });
  it("uses the latest reversed timeline target rather than the old forward time", () => {
    const { ui, video } = mount(30);
    ui.rerender(<EditorVideoLayer {...base} timelineTime={100} reverse />);
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBeCloseTo(7100);
  });
  it("still keeps the original audio enabled and source cleanup on unmount", () => {
    const { ui, video } = mount(3600);
    expect(video.muted).toBe(false);
    expect(video.getAttribute("src")).toBe(base.source);
    ui.unmount();
    expect(video.getAttribute("src")).toBeNull();
  });
});
