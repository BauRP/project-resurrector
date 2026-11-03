import {afterEach,describe,expect,it,vi} from "vitest";
import {mesh,isValidMeshMessage} from "./mesh";
const internal=mesh as unknown as {
  channels:Map<RTCDataChannel,string|null>;
  peers:Map<string,{id:string;name:string;via:string;lastSeen:number;recording:boolean;battery:null;storageMB:null;latency:null}>;
  wire:(ch:RTCDataChannel)=>void;
  handle:(message:unknown,via:"webrtc"|"local",channel?:RTCDataChannel)=>void;
};
const peer=(id:string)=>({id,name:"Camera",via:"webrtc",lastSeen:Date.now(),recording:false,battery:null,storageMB:null,latency:null});
const channel=(send=vi.fn())=>({readyState:"open",send,close:vi.fn()} as unknown as RTCDataChannel);
afterEach(()=>{internal.channels.clear();internal.peers.clear();});
describe("multi-phone mesh message trust and isolation",()=>{
 it("rejects unknown/oversized IDs and impossible telemetry",()=>{
   for(const m of [
     null,{type:"ping",from:"",t:1},{type:"ping",from:"x".repeat(100),t:1},
     {type:"ping",from:"bad peer",t:1},{type:"ping",from:"phone",t:NaN},
     {type:"record",from:"phone",on:"yes",at:1},
     {type:"telemetry",from:"phone",name:"A",recording:true,battery:200,storageMB:0},
     {type:"dangerous",from:"phone"}]){
     expect(isValidMeshMessage(m)).toBe(false);
     internal.handle(m,"local");
   }
   expect(internal.peers.size).toBe(0);
 });
 it("never elevates an unpaired first record packet into a connected director",()=>{
   const received=vi.fn();
   const off=mesh.onMessage(received);
   try {
     internal.handle({type:"record",from:"rogue",on:true,at:Date.now()},"local");
     expect(internal.peers.has("rogue")).toBe(false);
     expect(received).not.toHaveBeenCalled();
     internal.handle({type:"telemetry",from:"director",name:"Phone",
       battery:75,storageMB:500,recording:false},"local");
     received.mockClear();
     internal.handle({type:"record",from:"director",on:true,at:Date.now()},"local");
     expect(received).toHaveBeenCalledOnce();
   } finally { off(); }
 });
 it("maintains multiple distinct remote phones without collapsing their identities",()=>{
   const m=(from:string)=>({type:"telemetry",from,name:from,
     battery:75,storageMB:1024,recording:false});
   internal.handle(m("phone1"),"webrtc");
   internal.handle(m("phone2"),"webrtc");
   expect(internal.peers.size).toBe(2);
   expect(internal.peers.has("phone1")).toBe(true);
   expect(internal.peers.has("phone2")).toBe(true);
   internal.handle({type:"bye",from:"phone1"},"webrtc");
   expect(internal.peers.has("phone2")).toBe(true);
   expect(internal.peers.has("phone1")).toBe(false);
 });
});
describe("peer connection loss must not hide healthy remote cameras",()=>{
 it("rejects oversized and binary WebRTC messages before parsing",()=>{
  const ch=channel();
  internal.wire(ch);
  const listener=vi.fn();
  const off=mesh.onMessage(listener);
  try {
    ch.onmessage?.({data:"x".repeat(100000)} as MessageEvent);
    ch.onmessage?.({data:new Uint8Array([1,2,3])} as unknown as MessageEvent);
    expect(listener).not.toHaveBeenCalled();
    expect(internal.peers.size).toBe(0);
    ch.onmessage?.({data:JSON.stringify({type:"telemetry",from:"valid",name:"Camera",
      battery:55,storageMB:700,recording:false})} as MessageEvent);
    expect(internal.peers.has("valid")).toBe(true);
  } finally {off();}
 });
 it("does not break remote WebRTC peers when local BroadcastChannel closes mid-send",()=>{
  const ch=channel();internal.channels.set(ch,"phone1");internal.peers.set("phone1",peer("phone1"));
  const broken={postMessage:vi.fn(()=>{throw Error("closed")}),close:vi.fn()};
  (mesh as unknown as {bc:unknown;localId:string|null}).bc=broken;
  (mesh as unknown as {bc:unknown;localId:string|null}).localId="session";
  expect(()=>mesh.send({type:"ping",from:"self",t:1})).not.toThrow();
  expect(broken.close).toHaveBeenCalledOnce();
  expect((mesh as unknown as {bc:unknown;localId:string|null}).bc).toBeNull();
  expect(internal.peers.has("phone1")).toBe(true);
  expect(ch.send).toHaveBeenCalledOnce();
 });
 it("drops a failed send without throwing into the recording UI",()=>{
  const broken=channel(vi.fn(()=>{throw Error("NetworkLost")}));
  internal.channels.set(broken,"peer1");internal.peers.set("peer1",peer("peer1"));
  expect(()=>mesh.send({type:"ping",from:"self",t:1})).not.toThrow();
  expect(internal.channels.has(broken)).toBe(false);
  expect(internal.peers.has("peer1")).toBe(false);
 });
 it("a failed old connection cannot delete a newer channel for the same phone",()=>{
  const old=channel(vi.fn(()=>{throw Error("offline")}));
  const next=channel();
  internal.channels.set(old,"peer1");internal.channels.set(next,"peer1");
  internal.peers.set("peer1",peer("peer1"));
  mesh.send({type:"ping",from:"self",t:1});
  expect(internal.peers.has("peer1")).toBe(true);
  expect(internal.channels.has(next)).toBe(true);
 });
 it("cannot impersonate an existing director with the first packet on an unbound channel",()=>{
  const rogue=channel();
  internal.channels.set(rogue,null);
  internal.peers.set("director",peer("director"));
  const listener=vi.fn();
  const off=mesh.onMessage(listener);
  try {
    internal.handle({type:"record",from:"director",on:true,at:Date.now()},"webrtc",rogue);
    expect(listener).not.toHaveBeenCalled();
    expect(internal.channels.get(rogue)).toBeNull();
    internal.handle({type:"telemetry",from:"director",name:"Director",battery:70,
      storageMB:500,recording:false},"webrtc",rogue);
    expect(internal.channels.get(rogue)).toBe("director");
    listener.mockClear();
    internal.handle({type:"record",from:"director",on:true,at:Date.now()},"webrtc",rogue);
    expect(listener).toHaveBeenCalledOnce();
  } finally {off();}
 });
 it("cannot rebind an authenticated data channel to another remote camera",()=>{
  const ch=channel();internal.channels.set(ch,"phone1");
  internal.handle({type:"telemetry",from:"phone2",name:"spoof",
    battery:70,storageMB:200,recording:false},"webrtc",ch);
  expect(internal.peers.has("phone2")).toBe(false);
  expect(internal.channels.get(ch)).toBe("phone1");
 });
 it("a stale local bye does not delete a live WebRTC peer",()=>{
  const live=channel();
  internal.channels.set(live,"phone1");
  internal.peers.set("phone1",peer("phone1"));
  internal.handle({type:"bye",from:"phone1"},"local");
  expect(internal.peers.has("phone1")).toBe(true);
  expect(internal.channels.has(live)).toBe(true);
 });
 it("a stale bye must not hide the active replacement camera channel",()=>{
  const old=channel(),next=channel();
  internal.channels.set(old,"phone1");internal.channels.set(next,"phone1");
  internal.peers.set("phone1",peer("phone1"));
  internal.handle({type:"bye",from:"phone1"},"webrtc",old);
  expect(internal.peers.has("phone1")).toBe(true);
  expect(internal.channels.has(next)).toBe(true);
 });
 it("closing a stale connection cannot remove a reconnected peer",()=>{
  const old=channel(),next=channel();
  internal.wire(old);internal.wire(next);
  internal.channels.set(old,"peer1");internal.channels.set(next,"peer1");
  internal.peers.set("peer1",peer("peer1"));
  old.onclose?.(new Event("close") as CloseEvent);
  expect(internal.peers.has("peer1")).toBe(true);
  expect(internal.channels.has(next)).toBe(true);
 });
});
