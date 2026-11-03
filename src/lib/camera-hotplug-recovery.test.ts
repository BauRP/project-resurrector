import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  CameraHotplugGeneration, verifyCameraPresence, selectedCameraWasRemoved,
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
  it("waits for a second confirmed missing enumeration and preserves the real recorder finalization",()=>{
    const camera=readFileSync("src/components/multicam/CameraTab.tsx","utf8");
    expect(camera).toContain('verifyCameraPresence(deviceId, first) !== "missing"');
    expect(camera).toContain('verifyCameraPresence(deviceId, second) !== "missing"');
    expect(camera).toContain('window.setTimeout(resolve, 250)');
    expect(camera).toContain('generation.invalidate()');
    expect(camera).toContain('recordingStopWatch.current?.()');
    expect(camera).toContain('dualSession.current.stop(reason)');
    expect(camera).not.toContain('cameraController.release(owner.current);\n          const reason');
  });
});
