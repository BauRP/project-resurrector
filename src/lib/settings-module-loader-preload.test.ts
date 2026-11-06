import { afterEach, describe, expect, it, vi } from "vitest";
import { scheduleSettingsPreload } from "./settings-module-loader";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Settings preload and native navigation never compete", () => {
  it("cancels its scheduled import if Settings is opened during startup", () => {
    vi.useFakeTimers();
    const idle = vi.fn(() => 23);
    const cancelIdle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);
    vi.stubGlobal("cancelIdleCallback", cancelIdle);
    const cancel = scheduleSettingsPreload();
    window.dispatchEvent(new Event("multicam-settings-navigation-start"));
    vi.advanceTimersByTime(9000);
    expect(idle).not.toHaveBeenCalled();
    cancel();
  });

  it("cancels the pending idle compilation when navigation begins", () => {
    vi.useFakeTimers();
    const idle = vi.fn(() => 77);
    const cancelIdle = vi.fn();
    vi.stubGlobal("requestIdleCallback", idle);
    vi.stubGlobal("cancelIdleCallback", cancelIdle);
    const cancel = scheduleSettingsPreload();
    vi.advanceTimersByTime(3500);
    expect(idle).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("multicam-settings-navigation-start"));
    expect(cancelIdle).toHaveBeenCalledWith(77);
    cancel();
  });

  it("unmount cleanup cancels warmup without mounting Settings", () => {
    vi.useFakeTimers();
    const idle = vi.fn(() => 4);
    vi.stubGlobal("requestIdleCallback", idle);
    const cancel = scheduleSettingsPreload();
    cancel();
    vi.advanceTimersByTime(9000);
    expect(idle).not.toHaveBeenCalled();
  });
});
