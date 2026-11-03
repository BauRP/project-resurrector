import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CameraHotplugGeneration, verifyCameraPresence, selectedCameraWasRemoved, confirmSelectedCameraRemoved,
} from "./camera-hotplug-recovery";

type Device = Pick<MediaDeviceInfo, "kind" | "deviceId">;
const video=(id:string):Device=>({kind:"videoinput",deviceId:id});
const mic=(id:string):Device=>({kind:"audioinput",deviceId:id});

describe("camera unplug evidence during fold and recording",()=>{
  it("requires an exact missing video device, not an empty permission-redacted list",()=>{
    expect(verifyCameraPresence("usb", [video("usb"),video("front")])).toBe("present");
    expect(verifyCameraPresence("usb", [video("front")])).toBe("missing");
    expect(verifyCameraPresence("usb", [video(""),video("")])).toBe("unknown");
    expect(verifyCameraPresence("usb", [])).toBe("unknown");
    expect(verifyCameraPresence("usb", [mic("usb")])).toBe("unknown");
    expect(verifyCameraPresence("",[video("front")])).toBe("unknown");
    expect(selectedCameraWasRemoved("usb",[video("front")])).toBe(true);
    expect(selectedCameraWasRemoved("usb",[])).toBe(false);
  });
  it("rejects an old enumeration after reconnect, lens switch or Activity disposal",()=>{
    const generation=new CameraHotplugGeneration();
    const first=generation.next();
    const next=generation.next();
    expect(generation.isCurrent(first)).toBe(false);
    expect(generation.isCurrent(next)).toBe(true);
    generation.invalidate();
    expect(generation.isCurrent(next)).toBe(false);
  });
  it("requires two reliable missing lists and respects a camera coming back",async()=>{
    let result=await confirmSelectedCameraRemoved("usb",
      async()=>[video("front")],()=>true,async()=>undefined);
    expect(result).toBe(true);
    let calls=0;
    result=await confirmSelectedCameraRemoved("usb",
      async()=>++calls===1?[video("front")]:[video("usb"),video("front")],
      ()=>true,async()=>undefined);
    expect(result).toBe(false);
    result=await confirmSelectedCameraRemoved("usb",
      async()=>[video("")],()=>true,async()=>undefined);
    expect(result).toBe(false);
  });
  it("does not let a stale fold/selection query interrupt a newer recorder",async()=>{
    let valid=true;
    const result=await confirmSelectedCameraRemoved("usb",
      async()=>[video("front")],()=>valid,async()=>{valid=false;});
    expect(result).toBe(false);
    let calls=0;
    const gone=await confirmSelectedCameraRemoved("usb",async()=>{
      calls++; throw new Error("permissions changed");
    },()=>true,async()=>undefined);
    expect(gone).toBe(false);
    expect(calls).toBe(1);
  });
  it("waits for a second confirmed missing enumeration and preserves the real recorder finalization",()=>{
    const camera=readFileSync("src/components/multicam/CameraTab.tsx","utf8");
    expect(camera).toContain('confirmSelectedCameraRemoved(');
    expect(camera).toContain('generation.isCurrent(token)');
    expect(camera).toContain('window.setTimeout(resolve, 250)');
    expect(camera).toContain('generation.invalidate()');
    expect(camera).toContain('recordingStopWatch.current?.()');
    expect(camera).toContain('dualSession.current.stop(reason)');
    expect(camera).not.toContain('cameraController.release(owner.current);\n          const reason');
  });
});
