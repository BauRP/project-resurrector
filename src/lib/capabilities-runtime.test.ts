import {beforeEach,afterEach,describe,expect,it,vi} from "vitest";
import {probeDevice} from "./capabilities";

const originalMedia=Object.getOwnPropertyDescriptor(navigator,"mediaDevices");
const originalStorage=Object.getOwnPropertyDescriptor(navigator,"storage");
function fakeStream(track?:Partial<MediaStreamTrack>){
  const stop=vi.fn();
  const tracks=track?[{stop,...track} as unknown as MediaStreamTrack]:[];
  return {stream:{getVideoTracks:()=>tracks,getAudioTracks:()=>tracks,
    getTracks:()=>tracks} as unknown as MediaStream,stop};
}
function setup(streams:MediaStream[]){
  let calls=0;
  const getUserMedia=vi.fn(async()=>streams[Math.min(calls++,streams.length-1)]!);
  Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{
    getUserMedia, enumerateDevices:async()=>[],
  }});
  Object.defineProperty(navigator,"storage",{configurable:true,value:{persist:async()=>true}});
  return getUserMedia;
}
beforeEach(()=>localStorage.clear());
afterEach(()=>{
  if(originalMedia)Object.defineProperty(navigator,"mediaDevices",originalMedia);
  else Reflect.deleteProperty(navigator,"mediaDevices");
  if(originalStorage)Object.defineProperty(navigator,"storage",originalStorage);
  else Reflect.deleteProperty(navigator,"storage");
});
describe("camera startup probes use actual opened tracks",()=>{
 it("does not grant camera or microphone merely because getUserMedia resolved",async()=>{
   const empty=fakeStream();
   setup([empty.stream]);
   const m=await probeDevice(()=>{});
   expect(m.permissions.camera).not.toBe("granted");
   expect(m.permissions.microphone).not.toBe("granted");
   expect(m.rear.available).toBe(false);
   expect(m.front.available).toBe(false);
 });
 it("never advertises a camera from a stream with zero video tracks",async()=>{
   const noVideo=fakeStream();
   setup([noVideo.stream]);
   const m=await probeDevice(()=>{});
   expect(m.rear.available).toBe(false);
   expect(m.front.available).toBe(false);
   expect(m.rear.resolutions).toEqual([]);
 });
 it("releases a live track and does not claim success if OEM capabilities throw",async()=>{
   const permitted=fakeStream({readyState:"live",getCapabilities:()=>({})});
   const broken=fakeStream({readyState:"live",getCapabilities:()=>{throw Error("OEM");}});
   setup([permitted.stream,broken.stream]);
   const m=await probeDevice(()=>{});
   expect(m.rear.available).toBe(false);
   expect(m.front.available).toBe(false);
   expect(broken.stop).toHaveBeenCalled();
 });
 it("rejects a front camera mistakenly opened by fallback rear video:true",async()=>{
   const permission=fakeStream({readyState:"live",getCapabilities:()=>({})});
   const frontInstead=fakeStream({
     readyState:"live",getSettings:()=>({deviceId:"selfie",facingMode:"user"}),
     getCapabilities:()=>({width:{min:640,max:1920}})
   });
   setup([permission.stream,frontInstead.stream]);
   const m=await probeDevice(()=>{});
   expect(m.rear.available).toBe(false);
   expect(m.rear.deviceId).toBeNull();
   expect(frontInstead.stop).toHaveBeenCalled();
 });
 it("does not label an unidentified generic fallback as the rear camera",async()=>{
   const permission=fakeStream({readyState:"live",getCapabilities:()=>({})});
   const unknown=fakeStream({readyState:"live",getSettings:()=>({deviceId:"ambiguous"}),
     getCapabilities:()=>({width:{min:640,max:1920}})});
   let call=0;
   Object.defineProperty(navigator,"mediaDevices",{configurable:true,value:{
     getUserMedia:vi.fn(async(constraints:MediaStreamConstraints)=>{
       if(constraints.video && typeof constraints.video==="object" &&
         "facingMode" in constraints.video && constraints.video.facingMode) {
           throw new Error("Exact facing unavailable");
       }
       return ++call===1?permission.stream:unknown.stream;
     }),
     enumerateDevices:async()=>[],
   }});
   Object.defineProperty(navigator,"storage",{configurable:true,value:{persist:async()=>true}});
   const m=await probeDevice(()=>{});
   expect(m.rear.available).toBe(false);
   expect(m.rear.deviceId).toBeNull();
   expect(unknown.stop).toHaveBeenCalled();
 });
 it("keeps a working lens available but does not invent verified recording modes",async()=>{
   const permission=fakeStream({readyState:"live",getCapabilities:()=>({})});
   const opened=fakeStream({readyState:"live",label:"Back",getSettings:()=>({deviceId:"back"}),
     getCapabilities:()=>({width:{min:640,max:1920},height:{min:480,max:1080},
       frameRate:{min:15,max:30},zoom:{min:1,max:4}})});
   setup([permission.stream,opened.stream]);
   const m=await probeDevice(()=>{});
   expect(m.rear.available).toBe(true);
   expect(m.rear.deviceId).toBe("back");
   expect(m.rear.resolutions).toEqual([]);
   expect(m.rear.candidateFps).not.toContain(60);
   expect(m.rear.zoom).toEqual([1,4]);
   expect(opened.stop).toHaveBeenCalled();
 });
});
