import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { SettingsEntryGate } from "@/components/multicam/SettingsEntryGate";

vi.mock("@/lib/freeze-action-trace", () => ({ traceUiAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
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
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByTestId("settings-controls").textContent).toContain("All settings");
    act(() => { vi.advanceTimersByTime(2000); });
    expect(screen.getAllByTestId("settings-controls")).toHaveLength(1);
  });

  it("still opens Settings on background WebViews that suppress animation frames", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 77));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<SettingsEntryGate><button>Privacy controls</button></SettingsEntryGate>);
    act(() => { vi.advanceTimersByTime(1099); });
    expect(screen.queryByRole("button", { name: "Privacy controls" })).toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.getByRole("button", { name: "Privacy controls" })).toBeTruthy();
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
