import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { SettingsEntryGate } from "@/components/multicam/SettingsEntryGate";
import { Capacitor } from "@capacitor/core";
import { uiFreeze } from "@/lib/ui-freeze-bridge";

vi.mock("@/lib/freeze-action-trace", () => ({ traceUiAction: vi.fn() }));
vi.mock("@/lib/ui-freeze-bridge", () => ({
  uiFreeze: { awaitVisualState: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function mockFrames() {
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    frames.push(fn);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  return frames;
}

describe("Settings navigation on old Android WebView", () => {
  it("keeps the previous screen released for three paints, then shows Settings", () => {
    vi.useFakeTimers();
    const frames = mockFrames();
    render(<SettingsEntryGate><div data-testid="settings-controls">Все настройки</div></SettingsEntryGate>);
    expect(screen.getByRole("status").textContent).toContain("Открываю настройки");
    for (const t of [16, 32]) {
      act(() => { frames.shift()?.(t); vi.advanceTimersByTime(0); });
      expect(screen.queryByTestId("settings-controls")).toBeNull();
    }
    act(() => { frames.shift()?.(48); vi.advanceTimersByTime(0); });
    expect(screen.getByTestId("settings-controls").textContent).toContain("Все настройки");
  });
  it("does not block Settings on a never-resolving native visual-state promise", () => {
    vi.useFakeTimers();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.mocked(uiFreeze.awaitVisualState).mockReturnValue(new Promise(() => undefined));
    const frames = mockFrames();
    render(<SettingsEntryGate><button>Настройки камеры</button></SettingsEntryGate>);
    for (const t of [100, 200, 300]) {
      act(() => { frames.shift()?.(t); vi.advanceTimersByTime(0); });
    }
    expect(screen.getByRole("button", { name: "Настройки камеры" })).toBeTruthy();
    // The expensive optional renderer frame-commit probe is preserved as a
    // native diagnostic API, not invoked in the navigation critical path.
    expect(uiFreeze.awaitVisualState).not.toHaveBeenCalled();
  });
  it("opens on a slow but responding software renderer at 5 frames per second", () => {
    vi.useFakeTimers();
    const frames = mockFrames();
    render(<SettingsEntryGate><div data-testid="settings-controls">Работает</div></SettingsEntryGate>);
    for (const t of [200, 400]) {
      act(() => { frames.shift()?.(t); vi.advanceTimersByTime(0); });
      expect(screen.queryByTestId("settings-controls")).toBeNull();
    }
    act(() => { frames.shift()?.(600); vi.advanceTimersByTime(0); });
    expect(screen.getByTestId("settings-controls").textContent).toBe("Работает");
  });
  it("never forces a heavy Settings mount if the visible JavaScript renderer is frozen", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 77));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<SettingsEntryGate><button>Настройки</button></SettingsEntryGate>);
    act(() => { vi.advanceTimersByTime(12000); });
    expect(screen.queryByRole("button", { name: "Настройки" })).toBeNull();
  });
  it("permits Android background restoration when RAF is intentionally suspended", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 77));
    render(<SettingsEntryGate><button>Настройки</button></SettingsEntryGate>);
    act(() => { vi.advanceTimersByTime(1800); });
    expect(screen.getByRole("button", { name: "Настройки" })).toBeTruthy();
  });
  it("cancels a queued Settings mount after a rapid return to Camera", () => {
    vi.useFakeTimers();
    const frames = mockFrames();
    const ui=render(<SettingsEntryGate><div data-testid="stale">Старые настройки</div></SettingsEntryGate>);
    ui.unmount();
    act(() => {
      for (const frame of frames) frame(300);
      vi.runAllTimers();
    });
    expect(screen.queryByTestId("stale")).toBeNull();
  });
});
