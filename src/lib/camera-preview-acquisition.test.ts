import {afterEach,describe,expect,it,vi} from "vitest";
import {acquireWebViewPreviewWithNativeGuard,NativeCameraBusyError,nativeCameraStateSafeForWebView,CameraDeviceMismatchError,explicitVideoDeviceId,MicrophoneDeviceMismatchError,explicitAudioDeviceId} from "./camera-preview-acquisition";
import {cameraController,CameraSupersededError,CameraUnavailableError} from "./camera-controller";
import {diagnosticCaptureGate} from "./diagnostic-capture-gate";
import {readFileSync} from "node:fs";

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
 it("denies preview while diagnostics own a camera and retries after they finish",async()=>{
  const {stream}=live();
  const getUserMedia=vi.fn(async()=>stream);
  vi.stubGlobal("navigator",{mediaDevices:{getUserMedia}});
  const lease=diagnosticCaptureGate.acquire("raw")!;
  try {
    await expect(acquireWebViewPreviewWithNativeGuard(Symbol("ui"),
      {video:true,audio:false},null)).rejects.toBeInstanceOf(NativeCameraBusyError);
    expect(getUserMedia).not.toHaveBeenCalled();
  } finally {lease.release();}
  const owner=Symbol("ui");
  await expect(acquireWebViewPreviewWithNativeGuard(owner,
    {video:true,audio:false},null)).resolves.toBe(stream);
  expect(getUserMedia).toHaveBeenCalledOnce();
  cameraController.release(owner);
 });
 it("cancels a pending native check if diagnostic ownership changes",async()=>{
  const {stream,stop}=live();
  let acquireDiagnostic=()=>{};
  const getUserMedia=vi.fn(async()=>{
    acquireDiagnostic();
    return stream;
  });
  vi.stubGlobal("navigator",{mediaDevices:{getUserMedia}});
  const leases: Array<{ release: () => void }> = [];
  acquireDiagnostic=()=>{
    const lease=diagnosticCaptureGate.acquire("stabilization");
    if (lease) leases.push(lease);
  };
  try {
    await expect(acquireWebViewPreviewWithNativeGuard(Symbol("ui"),
      {video:true,audio:false},null)).rejects.toBeInstanceOf(NativeCameraBusyError);
    expect(stop).toHaveBeenCalledOnce();
  } finally { leases.forEach(lease => lease.release()); }
 });
 it("subscribes live camera preview to diagnostic release after a fold remount",()=>{
  const source=readFileSync("src/components/multicam/CameraTab.tsx","utf8");
  expect(source).toContain("useSyncExternalStore(");
  expect(source).toContain("diagnosticCaptureGate.subscribe, diagnosticCaptureGate.getSnapshot");
  expect(source).toContain("appliedDevice.lens, diagnosticRevision");
 });
 it("does not silently substitute another real camera for an exact selected USB lens",async()=>{
   expect(explicitVideoDeviceId({video:{deviceId:{exact:"usb-A"}}})).toBe("usb-A");
   expect(explicitVideoDeviceId({video:{facingMode:"environment"}})).toBeNull();
   const {stream,stop}=live();
   Object.defineProperty(stream.getVideoTracks()[0],"getSettings",{
     value:()=>({deviceId:"internal-rear"}),configurable:true,
   });
   vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:vi.fn(async()=>stream)}});
   await expect(acquireWebViewPreviewWithNativeGuard(Symbol("usb"),
     {video:{deviceId:{exact:"usb-A"}},audio:false},null))
      .rejects.toBeInstanceOf(CameraDeviceMismatchError);
   expect(stop).toHaveBeenCalledOnce();
 });
 it("does not treat omitted OEM device identity as proof of a different lens",async()=>{
   const {stream}=live();
   Object.defineProperty(stream.getVideoTracks()[0],"getSettings",{
     value:()=>({width:1280}),configurable:true,
   });
   vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:vi.fn(async()=>stream)}});
   const owner=Symbol("usb");
   await expect(acquireWebViewPreviewWithNativeGuard(owner,
     {video:{deviceId:{exact:"usb-A"}},audio:false},null)).resolves.toBe(stream);
   cameraController.release(owner);
 });
 it("does not fall back to silent video when an exact external microphone is selected",async()=>{
   expect(explicitAudioDeviceId({audio:{deviceId:{exact:"usb-mic"}}})).toBe("usb-mic");
   expect(explicitAudioDeviceId({audio:true})).toBeNull();
   const gum=vi.fn(async()=>{throw new Error("USB microphone disconnected");});
   vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:gum}});
   await expect(acquireWebViewPreviewWithNativeGuard(Symbol("mic"),
     {video:true,audio:{deviceId:{exact:"usb-mic"}}},null))
     .rejects.toThrow("USB microphone disconnected");
   expect(gum).toHaveBeenCalledOnce();
 });
 it("rejects a live video stream that omitted or substituted the selected audio source",async()=>{
   const {stream,stop}=live();
   const gum=vi.fn(async()=>stream);
   vi.stubGlobal("navigator",{mediaDevices:{getUserMedia:gum}});
   await expect(acquireWebViewPreviewWithNativeGuard(Symbol("mic"),
     {video:true,audio:{deviceId:{exact:"usb-mic"}}},null))
     .rejects.toBeInstanceOf(MicrophoneDeviceMismatchError);
   expect(stop).toHaveBeenCalledOnce();
   const audio={readyState:"live",getSettings:()=>({deviceId:"internal-mic"}),stop:vi.fn()};
   const {stream:second,stop:secondStop}=live();
   Object.defineProperty(second,"getAudioTracks",{value:()=>[audio]});
   Object.defineProperty(second,"getTracks",{value:()=>[second.getVideoTracks()[0],audio]});
   gum.mockImplementation(async()=>second);
   await expect(acquireWebViewPreviewWithNativeGuard(Symbol("mic2"),
     {video:true,audio:{deviceId:{exact:"usb-mic"}}},null))
     .rejects.toBeInstanceOf(MicrophoneDeviceMismatchError);
   expect(secondStop).toHaveBeenCalledOnce();
   expect(audio.stop).toHaveBeenCalledOnce();
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
