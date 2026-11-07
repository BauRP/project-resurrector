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

describe("native Settings paint boundary", () => {
  it("keeps the existing navigation shell alive across both render frames", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<SettingsEntryGate><div data-testid="settings-controls">All settings remain available</div></SettingsEntryGate>);
    expect(screen.queryByTestId("settings-controls")).toBeNull();
    act(() => { frames.shift()?.(16); });
    expect(screen.queryByTestId("settings-controls")).toBeNull();
    act(() => { frames.shift()?.(32); });
    expect(screen.queryByTestId("settings-controls")).toBeNull();
    act(() => { frames.shift()?.(48); });
    expect(screen.queryByTestId("settings-controls")).toBeNull();
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByTestId("settings-controls").textContent).toContain("All settings");
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getAllByTestId("settings-controls")).toHaveLength(1);
  });

  it("waits for native Chromium visual state, not just JavaScript rAF", async () => {
    vi.useFakeTimers();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    let confirm!: (result: { ready: boolean; elapsedMs: number }) => void;
    vi.mocked(uiFreeze.awaitVisualState).mockReturnValue(
      new Promise(resolve => { confirm = resolve; }));
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<SettingsEntryGate><button>Render-safe Camera2 settings</button></SettingsEntryGate>);
    act(() => { frames.shift()?.(16); frames.shift()?.(32); frames.shift()?.(48); vi.advanceTimersByTime(0); });
    expect(uiFreeze.awaitVisualState).toHaveBeenCalledOnce();
    expect(screen.queryByText("Render-safe Camera2 settings")).toBeNull();
    await act(async () => { confirm({ ready: true, elapsedMs: 22 }); await Promise.resolve(); });
    expect(screen.queryByText("Render-safe Camera2 settings")).toBeNull();
    act(() => { frames.shift()?.(64); frames.shift()?.(80); vi.advanceTimersByTime(0); });
    expect(screen.getByText("Render-safe Camera2 settings")).toBeTruthy();
  });
  it("does not open Settings after a timed-out native visual-state check", async () => {
    vi.useFakeTimers();
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    vi.mocked(uiFreeze.awaitVisualState).mockResolvedValue({ ready: false, elapsedMs: 4500 });
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<SettingsEntryGate><button>Camera2 features intact</button></SettingsEntryGate>);
    act(() => {
      frames.shift()?.(16); frames.shift()?.(32); frames.shift()?.(48);
      vi.advanceTimersByTime(0);
    });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText("Camera2 features intact")).toBeNull();
    act(() => { vi.advanceTimersByTime(900); });
    await act(async () => { await Promise.resolve(); });
    expect(vi.mocked(uiFreeze.awaitVisualState).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Camera2 features intact")).toBeNull();
  });
  it("does not force-mount Settings while a visible renderer is still blocked", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 77));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<SettingsEntryGate><button>Privacy controls</button></SettingsEntryGate>);
    act(() => { vi.advanceTimersByTime(12000); });
    expect(screen.queryByRole("button", { name: "Privacy controls" })).toBeNull();
  });
  it("still opens Settings in background WebViews that suppress animation frames", () => {
    vi.useFakeTimers();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 77));
    render(<SettingsEntryGate><button>Privacy controls</button></SettingsEntryGate>);
    act(() => { vi.advanceTimersByTime(1799); });
    expect(screen.queryByRole("button", { name: "Privacy controls" })).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("button", { name: "Privacy controls" })).toBeTruthy();
    hidden.mockRestore();
  });

  it("never mounts a stale Settings screen after fast Camera navigation", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 17));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const view = render(<SettingsEntryGate><div data-testid="stale">Stale Settings</div></SettingsEntryGate>);
    view.unmount();
    act(() => { vi.runAllTimers(); });
    expect(screen.queryByTestId("stale")).toBeNull();
  });
});
