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
 it("cannot rebind an authenticated data channel to another remote camera",()=>{
  const ch=channel();internal.channels.set(ch,"phone1");
  internal.handle({type:"telemetry",from:"phone2",name:"spoof",
    battery:70,storageMB:200,recording:false},"webrtc",ch);
  expect(internal.peers.has("phone2")).toBe(false);
  expect(internal.channels.get(ch)).toBe("phone1");
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
