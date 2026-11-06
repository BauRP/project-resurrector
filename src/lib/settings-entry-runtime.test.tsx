import {act,cleanup,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {SettingsEntryGate} from "@/components/multicam/SettingsEntryGate";

afterEach(()=>{
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("real Settings mount / remount and slow WebView repaint",()=>{
  it("does not mount Settings during the camera teardown render",()=>{
    vi.useFakeTimers();
    const raf=vi.fn((_fn:FrameRequestCallback)=>1);
    vi.stubGlobal("requestAnimationFrame",raf);
    vi.stubGlobal("cancelAnimationFrame",vi.fn());
    const ui=render(<SettingsEntryGate><button>Camera2 settings button</button></SettingsEntryGate>);
    expect(screen.queryByText("Camera2 settings button")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Открываю настройки");
    act(()=>{vi.advanceTimersByTime(1100);});
    expect(screen.getByText("Camera2 settings button")).toBeTruthy();
    ui.unmount();
  });
  it("unmount cancels pending fallback; stale callback cannot revive controls",()=>{
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame",vi.fn(()=>3));
    vi.stubGlobal("cancelAnimationFrame",vi.fn());
    const ui=render(<SettingsEntryGate><button>Real Settings</button></SettingsEntryGate>);
    ui.unmount();
    act(()=>vi.advanceTimersByTime(1500));
    expect(screen.queryByText("Real Settings")).toBeNull();
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(3);
  });
  it("repeated entry makes full Settings accessible without dropping tools",()=>{
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame",vi.fn(()=>2));
    vi.stubGlobal("cancelAnimationFrame",vi.fn());
    for(let i=0;i<12;i++){
      const ui=render(<SettingsEntryGate><button>Theme switch</button></SettingsEntryGate>);
      act(()=>vi.runAllTimers());
      expect(screen.getByText("Theme switch")).toBeTruthy();
      ui.unmount();
    }
  });
});
