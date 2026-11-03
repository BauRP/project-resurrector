import {readFileSync} from "node:fs";
import {afterEach,describe,expect,it,vi} from "vitest";
import {mesh} from "./mesh";
type State={pending:RTCPeerConnection|null;generation:number};
const state=mesh as unknown as State;
const answer=(sdp:string)=>"P0."+btoa(JSON.stringify({k:"a",sdp})).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
afterEach(()=>{state.pending=null;});
describe("QR offer concurrency contract",()=>{
 it("rejects an older offer both before and after async QR encoding",()=>{
   const source=readFileSync("src/lib/mesh.ts","utf8");
   expect(source).toContain('generation !== this.generation || this.pending !== pc');
   expect(source).toMatch(/const code = await bounded\(encode\(\{ k: "o", s: session, sdp \}/);
   expect(source).toMatch(/const code = await bounded[\s\S]*if \(generation !== this.generation \|\| this.pending !== pc\)/);
 });
});
describe("remote camera answer does not corrupt a newer QR handshake",()=>{
 it("rejects oversized and malformed pairing input before applying a remote SDP",async()=>{
  const pc={setRemoteDescription:vi.fn(async()=>{})} as unknown as RTCPeerConnection;
  state.pending=pc;
  await expect(mesh.acceptAnswer("P0."+"A".repeat(70000))).rejects.toThrow("слишком большой");
  await expect(mesh.acceptAnswer("P0.invalid!")).rejects.toThrow("Недействительный");
  expect(pc.setRemoteDescription).not.toHaveBeenCalled();
 });
 it("accepts the matching pending connection",async()=>{
  const pc={setRemoteDescription:vi.fn(async()=>{})} as unknown as RTCPeerConnection;
  state.pending=pc;
  await mesh.acceptAnswer(answer("v=0"));
  expect(pc.setRemoteDescription).toHaveBeenCalledOnce();
  expect(state.pending).toBeNull();
 });
 it("does not return a superseded offer after another QR request replaces it",async()=>{
  let releaseFirst!:()=>void;
  let created=0;
  const FakeConnection=class {
    readonly index=++created;
    iceGatheringState="complete";
    localDescription={sdp:"v=0"};
    close=vi.fn();
    addEventListener=vi.fn();
    removeEventListener=vi.fn();
    createDataChannel=vi.fn(()=>({readyState:"connecting"}));
    createOffer=vi.fn(async()=>({type:"offer",sdp:"v=0"}));
    setLocalDescription=vi.fn(async()=>{
      if(this.index===1) await new Promise<void>(resolve=>{releaseFirst=resolve;});
    });
  };
  vi.stubGlobal("RTCPeerConnection",FakeConnection);
  try {
    const first=mesh.createOffer("session");
    await vi.waitFor(()=>expect(releaseFirst).toBeTypeOf("function"));
    const second=mesh.createOffer("session");
    releaseFirst();
    await expect(first).rejects.toThrow("Устаревшее предложение");
    const latest=await second;
    expect(latest.code).toMatch(/^P[01]\\./);
  } finally {
    mesh.leave();
    vi.unstubAllGlobals();
  }
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
 it("rejects an answer when leave advances the session generation mid-handshake",async()=>{
  let resolve!:()=>void;
  const pc={setRemoteDescription:vi.fn(()=>new Promise<void>(r=>{resolve=r;}))} as unknown as RTCPeerConnection;
  state.pending=pc;
  const generation=state.generation;
  const pending=mesh.acceptAnswer(answer("v=0"));
  await vi.waitFor(()=>expect(pc.setRemoteDescription).toHaveBeenCalledOnce());
  state.generation=generation+1;
  resolve();
  await expect(pending).rejects.toThrow("Сеанс подключения сменился");
  state.generation=generation;
 });
});
