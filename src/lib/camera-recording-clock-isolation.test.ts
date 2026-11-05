import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("10 Hz camera recording clock does not repaint the whole WebView camera UI", () => {
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
