import { describe, expect, it, vi } from "vitest";
import { distinctSecondaryCameras,liveWebViewCameraId,secondaryStreamMatchesSelection } from "./DualCameraPreview";
const devices = [
  { deviceId: "main", label: "Camera 1" },
  { deviceId: "front", label: "Camera 2" },
  { deviceId: "front", label: "Duplicate" },
  { deviceId: "", label: "Unknown" },
  { deviceId: "macro", label: "Camera 3" },
];
const track=(id:string|undefined,state:"live"|"ended"="live")=>({
 readyState:state,getSettings:vi.fn(()=>({deviceId:id})),
}) as unknown as MediaStreamTrack;
describe("separate camera preview candidates", () => {
  it("does not present another camera without a primary WebView ID", () => {
    expect(distinctSecondaryCameras(devices, "")).toEqual([]);
  });
  it("omits the primary stream, duplicates and unidentified cameras", () => {
    expect(distinctSecondaryCameras(devices, "main").map(c => c.deviceId)).toEqual(["front", "macro"]);
  });
  it("requires two live and independently identified camera tracks",()=>{
    const main=track("main"),front=track("front");
    expect(secondaryStreamMatchesSelection(main,front,"front")).toBe(true);
    expect(secondaryStreamMatchesSelection(main,front,"macro")).toBe(false);
    expect(secondaryStreamMatchesSelection(main,track("main"),"front")).toBe(false);
    expect(secondaryStreamMatchesSelection(main,track(undefined),"front")).toBe(false);
    expect(secondaryStreamMatchesSelection(main,track("front","ended"),"front")).toBe(false);
    expect(secondaryStreamMatchesSelection(main,main,"main")).toBe(false);
  });
  it("fails safely when the Android track getter throws after fold/rebind",()=>{
    const broken={readyState:"live",getSettings:()=>{throw Error("Camera2 disconnected");}} as unknown as MediaStreamTrack;
    expect(liveWebViewCameraId(broken)).toBeNull();
    expect(secondaryStreamMatchesSelection(track("main"),broken,"front")).toBe(false);
    expect(secondaryStreamMatchesSelection(broken,track("front"),"front")).toBe(false);
  });
});
