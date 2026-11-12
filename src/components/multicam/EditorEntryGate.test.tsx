import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorEntryGate } from "./EditorEntryGate";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";

vi.mock("@/lib/after-paint-task", () => ({ scheduleAfterResponsivePaint: vi.fn() }));
vi.mock("@/lib/freeze-action-trace", () => ({ traceUiAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(scheduleAfterResponsivePaint).mockReset();
  vi.restoreAllMocks();
});

describe("Android Editor waits for camera compositor teardown", () => {
  it("mounts the complete editor only after responsive frames", () => {
    let paint: (() => void) | undefined;
    vi.mocked(scheduleAfterResponsivePaint).mockImplementation(callback => {
      paint = callback; return vi.fn();
    });
    render(<EditorEntryGate><div data-testid="full-editor">Real editor</div></EditorEntryGate>);
    expect(screen.queryByTestId("full-editor")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Открываю редактор");
    expect(scheduleAfterResponsivePaint).toHaveBeenCalledWith(expect.any(Function), {
      stableFrames: 4, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true,
    });
    act(() => paint?.());
    expect(screen.getByTestId("full-editor").textContent).toBe("Real editor");
  });
  it("cancels pending media initialization after leaving Editor", () => {
    let paint: (() => void) | undefined;
    const cancel = vi.fn();
    vi.mocked(scheduleAfterResponsivePaint).mockImplementation(callback => {
      paint = callback; return cancel;
    });
    const view = render(<EditorEntryGate><div data-testid="full-editor" /></EditorEntryGate>);
    view.unmount();
    expect(cancel).toHaveBeenCalled();
    act(() => paint?.());
    expect(screen.queryByTestId("full-editor")).toBeNull();
  });
  it("schedules responsive frames even when Android incorrectly reports hidden", () => {
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    let paint: (() => void) | undefined;
    vi.mocked(scheduleAfterResponsivePaint).mockImplementation(callback => {
      paint = callback;
      return vi.fn();
    });
    render(<EditorEntryGate><div data-testid="full-editor" /></EditorEntryGate>);
    expect(scheduleAfterResponsivePaint).toHaveBeenCalledWith(expect.any(Function), {
      stableFrames: 4, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true,
    });
    // Scheduler calls its callback only after four actual responsive RAFs.
    act(() => paint?.());
    expect(screen.getByTestId("full-editor")).toBeInTheDocument();
  });

  it("cancels pending media initialization when navigating away", () => {
    const cancel = vi.fn();
    vi.mocked(scheduleAfterResponsivePaint).mockImplementation(() => cancel);
    const view = render(<EditorEntryGate><div data-testid="full-editor" /></EditorEntryGate>);
    view.unmount();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("keeps Editor mounted when the slow WebView only renders five frames each second", () => {
    const cancel = vi.fn();
    vi.mocked(scheduleAfterResponsivePaint).mockImplementation(() => cancel);
    render(<EditorEntryGate><span>Редактор</span></EditorEntryGate>);
    expect(scheduleAfterResponsivePaint).toHaveBeenCalledWith(expect.any(Function), {
      stableFrames: 4, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true,
    });
  });
});
