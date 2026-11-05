import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { CameraRecordingTimecode } from "@/components/multicam/CameraTab";
import { readFileSync } from "node:fs";

describe("10 Hz camera recording clock does not repaint the whole WebView camera UI", () => {
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
  it("updates only its own decisecond clock and cancels timers on unmount", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-05T00:00:00.000Z"));
    const start = Date.now();
    const ui = render(createElement(CameraRecordingTimecode, { recording: true, startedAt: start }));
    expect(screen.getByText("00:00.0")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getByText("00:01.1")).toBeTruthy();
    ui.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("isolates decisecond clock state in a child component", () => {
    const camera = readFileSync("src/components/multicam/CameraTab.tsx", "utf8");
    const begin = camera.indexOf("export function CameraRecordingTimecode(");
    const end = camera.indexOf("export function CameraTab(", begin);
    expect(begin).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(begin);
    const clock = camera.slice(begin, end);
    const body = camera.slice(end);
    expect(clock).toContain("window.setInterval(update, 100)");
    expect(clock).toContain("window.clearInterval(timer)");
    expect(clock).toContain("formatTime(elapsed)");
    expect(body).toContain("<CameraRecordingTimecode recording={s.recording} startedAt={s.recordingStartedAt} />");
    expect(body).not.toContain("setElapsed(");
    expect(body).not.toContain("window.setInterval(update, 100)");
    expect(body).toContain("const recorder = new MediaRecorder(source, { mimeType: mime })");
  });
});
