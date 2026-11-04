import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { SplashScreen } from "./SplashScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("startup cannot block on Android emulator permissions", () => {
  it("unlocks without getUserMedia or camera permissions", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    const getUserMedia = vi.fn(() => new Promise<MediaStream>(() => {}));
    const previous = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(navigator,"mediaDevices",{
      configurable:true,value:{getUserMedia},
    });
    try {
      render(<SplashScreen onDone={onDone} />);
      expect(screen.getByText("Подготовка интерфейса…")).toBeInTheDocument();
      act(() => { vi.advanceTimersByTime(90); });
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(onDone.mock.calls[0]?.[0]).toMatchObject({rear:{available:false},front:{available:false}});
    } finally {
      if(previous)Object.defineProperty(navigator,"mediaDevices",previous);
      else Reflect.deleteProperty(navigator,"mediaDevices");
    }
  });
  it("does not publish camera data after the splash unmounts", () => {
    vi.useFakeTimers();
    const onDone=vi.fn();
    const view=render(<SplashScreen onDone={onDone} />);
    view.unmount();
    act(() => {vi.advanceTimersByTime(1000);});
    expect(onDone).not.toHaveBeenCalled();
  });
});
