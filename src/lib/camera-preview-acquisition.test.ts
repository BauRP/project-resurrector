import {afterEach,describe,expect,it,vi} from "vitest";
import {acquireWebViewPreviewWithNativeGuard,NativeCameraBusyError,nativeCameraStateSafeForWebView} from "./camera-preview-acquisition";
import {cameraController,CameraSupersededError,CameraUnavailableError} from "./camera-controller";

const live=()=>{
 const stop=vi.fn(),track={readyState:"live",stop};
 return {stop,stream:{getVideoTracks:()=>[track],getTracks:()=>[track]} as unknown as MediaStream};
};
afterEach(()=>{cameraController.release();vi.unstubAllGlobals();});
describe("safe WebView camera acquisition across Camera2 and fold lifecycle",()=>{
 it("accepts only verified released states, not interrupted/error or unknown",()=>{
  for(const state of ["idle","saved"])expect(nativeCameraStateSafeForWebView(state)).toBe(true);
  for(const state of ["starting","previewing","recording","paused","stopping",
    "error","interrupted","unknown","",null,undefined])
    expect(nativeCameraStateSafeForWebView(state)).toBe(false);
 });
 it("never attempts getUserMedia when native Camera2 is recording",async()=>{
  const gum=vi.fn();vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:gum}});
  await expect(acquireWebViewPreviewWithNativeGuard(Symbol("ui"),{video:true,audio:true},
    async()=>({state:"recording"}))).rejects.toBeInstanceOf(NativeCameraBusyError);
  expect(gum).not.toHaveBeenCalled();
 });
 it("never opens a camera if Android bridge times out or rejects",async()=>{
  const gum=vi.fn();vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:gum}});
  await expect(acquireWebViewPreviewWithNativeGuard(Symbol("ui"),{video:true,audio:true},
    async()=>{throw Error("Activity destroyed");})).rejects.toThrow("Activity destroyed");
  expect(gum).not.toHaveBeenCalled();
 });
 it("rechecks native owner after pending WebView permission and releases the stream",async()=>{
  const {stream,stop}=live();let calls=0;
  vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:vi.fn(async()=>stream)}});
  await expect(acquireWebViewPreviewWithNativeGuard(Symbol("ui"),{video:true,audio:false},
    async()=>({state:++calls===1?"idle":"recording"})))
    .rejects.toBeInstanceOf(NativeCameraBusyError);
  expect(calls).toBe(2);expect(stop).toHaveBeenCalledOnce();
 });
 it("only retries without audio after initial media acquisition failed, not after native failure",async()=>{
  const {stream}=live(),gum=vi.fn().mockRejectedValueOnce(Error("Microphone unavailable")).mockResolvedValueOnce(stream);
  vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:gum}});
  let checked=0;
  await expect(acquireWebViewPreviewWithNativeGuard(Symbol("ui"),{video:true,audio:true},
    async()=>{checked++;return {state:"idle"};})).resolves.toBe(stream);
  expect(gum).toHaveBeenCalledTimes(2);
  expect(gum.mock.calls[1]![0]).toEqual({video:true,audio:false});
  expect(checked).toBe(3);
 });
 it("rejects absent video rather than retrying and advertising a camera",async()=>{
  const empty={getVideoTracks:()=>[],getTracks:()=>[]} as unknown as MediaStream;
  const gum=vi.fn(async()=>empty);
  vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:gum}});
  await expect(acquireWebViewPreviewWithNativeGuard(Symbol("ui"),{video:true,audio:true},null))
    .rejects.toBeInstanceOf(CameraUnavailableError);
  expect(gum).toHaveBeenCalledOnce();
 });
 it("does not return a stream after the camera screen was unmounted",async()=>{
  const {stream,stop}=live();let current=true;
  vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:vi.fn(async()=>{current=false;return stream;})}});
  await expect(acquireWebViewPreviewWithNativeGuard(Symbol("ui"),{video:true,audio:false},
    null,{isCurrent:()=>current})).rejects.toBeInstanceOf(CameraSupersededError);
  expect(stop).toHaveBeenCalledOnce();
 });
});
