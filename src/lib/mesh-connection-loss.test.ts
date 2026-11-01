import {afterEach,describe,expect,it,vi} from "vitest";
import {mesh} from "./mesh";
const internal=mesh as unknown as {
  channels:Map<RTCDataChannel,string|null>;
  peers:Map<string,{id:string;name:string;via:string;lastSeen:number;recording:boolean;battery:null;storageMB:null;latency:null}>;
  wire:(ch:RTCDataChannel)=>void;
};
const peer=(id:string)=>({id,name:"Camera",via:"webrtc",lastSeen:Date.now(),recording:false,battery:null,storageMB:null,latency:null});
const channel=(send=vi.fn())=>({readyState:"open",send,close:vi.fn()} as unknown as RTCDataChannel);
afterEach(()=>{internal.channels.clear();internal.peers.clear();});
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
