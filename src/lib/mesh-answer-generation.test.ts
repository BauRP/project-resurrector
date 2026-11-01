import {afterEach,describe,expect,it,vi} from "vitest";
import {mesh} from "./mesh";
type State={pending:RTCPeerConnection|null;generation:number};
const state=mesh as unknown as State;
const answer=(sdp:string)=>"P0."+btoa(JSON.stringify({k:"a",sdp})).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
afterEach(()=>{state.pending=null;});
describe("remote camera answer does not corrupt a newer QR handshake",()=>{
 it("accepts the matching pending connection",async()=>{
  const pc={setRemoteDescription:vi.fn(async()=>{})} as unknown as RTCPeerConnection;
  state.pending=pc;
  await mesh.acceptAnswer(answer("v=0"));
  expect(pc.setRemoteDescription).toHaveBeenCalledOnce();
  expect(state.pending).toBeNull();
 });
 it("rejects an older pending connection after the offer was replaced",async()=>{
  let resolve!:()=>void;
  const pc={setRemoteDescription:vi.fn(()=>new Promise<void>(r=>{resolve=r;}))} as unknown as RTCPeerConnection;
  const newer={setRemoteDescription:vi.fn()} as unknown as RTCPeerConnection;
  state.pending=pc;
  const promise=mesh.acceptAnswer(answer("v=0"));
  await vi.waitFor(()=>expect(pc.setRemoteDescription).toHaveBeenCalledOnce());
  state.pending=newer;
  resolve();
  await expect(promise).rejects.toThrow("Сеанс подключения сменился");
  expect(state.pending).toBe(newer);
  expect(newer.setRemoteDescription).not.toHaveBeenCalled();
 });
 it("rejects a stale answer after leave invalidated the generation",async()=>{
  const pc={setRemoteDescription:vi.fn(async()=>{})} as unknown as RTCPeerConnection;
  state.pending=pc;
  const generation=state.generation;
  // This verifies the preflight gate; no real peer connection is required.
  state.generation=generation+1;
  const broken=answer("v=0");
  await expect(mesh.acceptAnswer(broken)).rejects.toThrow("Устаревший");
  expect(pc.setRemoteDescription).not.toHaveBeenCalled();
  state.generation=generation;
 });
});
