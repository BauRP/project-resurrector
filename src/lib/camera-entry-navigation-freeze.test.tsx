import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CameraEntryGate } from "@/components/multicam/CameraEntryGate";

vi.mock("@/lib/freeze-action-trace", () => ({ traceUiAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Android Camera re-entry stays separate from Settings teardown", () => {
  it("mounts the complete Camera subtree only after responsive frame boundaries", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn);
      return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<CameraEntryGate><button>Включить камеру</button></CameraEntryGate>);
    expect(screen.queryByRole("button", { name: "Включить камеру" })).toBeNull();
    act(() => { frames.shift()?.(16); frames.shift()?.(32); });
    expect(screen.queryByRole("button", { name: "Включить камеру" })).toBeNull();
    act(() => { frames.shift()?.(48); vi.advanceTimersByTime(0); });
    expect(screen.getByRole("button", { name: "Включить камеру" })).toBeTruthy();
  });

  it("cannot remount a cancelled Camera after fast navigation", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 88));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const view = render(<CameraEntryGate><div>Stale camera</div></CameraEntryGate>);
    view.unmount();
    act(() => { vi.runAllTimers(); });
    expect(screen.queryByText("Stale camera")).toBeNull();
  });

  it("reopens Camera on a slow 5fps Android compositor without requiring 60fps", () => {
    vi.useFakeTimers();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      frames.push(fn); return frames.length;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    render(<CameraEntryGate><button>Включить камеру</button></CameraEntryGate>);
    for (const timestamp of [200,400]) {
      act(() => { frames.shift()?.(timestamp); vi.advanceTimersByTime(0); });
      expect(screen.queryByRole("button", { name: "Включить камеру" })).toBeNull();
    }
    act(() => { frames.shift()?.(600); vi.advanceTimersByTime(0); });
    expect(screen.getByRole("button", { name: "Включить камеру" })).toBeTruthy();
  });
});
