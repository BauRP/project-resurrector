// Serverless P2P mesh: WebRTC data channels with QR/copy-paste signaling (LAN, no internet),
// plus BroadcastChannel sessions for windows/tabs on the same device (numeric ID).
import { bounded } from "./async";
export interface PeerInfo { id: string; name: string; battery: number | null; storageMB: number | null; latency: number | null; via: "webrtc" | "local"; lastSeen: number; recording: boolean }
export type MeshMessage =
  | { type: "telemetry"; from: string; name: string; battery: number | null; storageMB: number | null; recording: boolean }
  | { type: "record"; from: string; on: boolean; at: number }
  | { type: "ping"; from: string; t: number; to?: string }
  | { type: "pong"; from: string; t: number; to: string }
  | { type: "bye"; from: string };

const deviceName = () => {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent;
  return /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Mac/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows" : "Device";
};

async function encode(obj: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let out: Uint8Array = bytes; let prefix = "P0";
  if (typeof CompressionStream !== "undefined") {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    out = new Uint8Array(await new Response(stream).arrayBuffer()); prefix = "P1";
  }
  let bin = ""; out.forEach((b) => { bin += String.fromCharCode(b); });
  return `${prefix}.${btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}
async function decode<T>(code: string): Promise<T> {
  const [prefix, body = ""] = code.trim().split(".");
  const bin = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
  let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (prefix === "P1") bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  else if (prefix !== "P0") throw new Error("Unknown code");
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
const waitIce = (pc: RTCPeerConnection) => new Promise<void>((resolve) => {
  if (pc.iceGatheringState === "complete") return resolve();
  const finish = () => { pc.removeEventListener("icegatheringstatechange", done); clearTimeout(timer); resolve(); };
  const done = () => { if (pc.iceGatheringState === "complete") finish(); };
  const timer = window.setTimeout(finish, 2500);
  pc.addEventListener("icegatheringstatechange", done);
});
export const candidateAddresses = (sdp: string) => Array.from(new Set(sdp.split("\n").filter((l) => l.startsWith("a=candidate")).map((l) => { const p = l.split(" "); return `${p[4]}:${p[5]}`; })));

class Mesh {
  selfId = Math.random().toString(36).slice(2, 10);
  name = deviceName();
  peers = new Map<string, PeerInfo>();
  private channels = new Map<RTCDataChannel, string | null>();
  private bc: BroadcastChannel | null = null;
  private pending: RTCPeerConnection | null = null;
  private connections = new Set<RTCPeerConnection>();
  private generation = 0;
  private listeners = new Set<() => void>();
  private handlers = new Set<(m: MeshMessage) => void>();
  private snapshot: PeerInfo[] = [];
  private timer: number | null = null;
  localId: string | null = null;
  selfRecording = false;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getSnapshot = () => this.snapshot;
  onMessage(fn: (m: MeshMessage) => void) { this.handlers.add(fn); return () => { this.handlers.delete(fn); }; }
  private emit() { this.snapshot = Array.from(this.peers.values()); this.listeners.forEach((l) => l()); }

  private start() {
    if (this.timer !== null || typeof window === "undefined") return;
    this.timer = window.setInterval(() => { void this.sendTelemetry(); this.send({ type: "ping", from: this.selfId, t: performance.now() });
      const now = Date.now(); let changed = false;
      this.peers.forEach((p, id) => { if (now - p.lastSeen > 12000) { this.peers.delete(id); changed = true; } });
      if (changed) this.emit(); }, 2000);
  }
  async sendTelemetry() {
    let battery: number | null = null; let storageMB: number | null = null;
    try { const b = await (navigator as Navigator & { getBattery?: () => Promise<{ level: number }> }).getBattery?.(); if (b) battery = Math.round(b.level * 100); } catch { battery = null; }
    try { const e = await navigator.storage?.estimate(); if (e?.quota) storageMB = Math.round(((e.quota ?? 0) - (e.usage ?? 0)) / 1048576); } catch { storageMB = null; }
    this.send({ type: "telemetry", from: this.selfId, name: this.name, battery, storageMB, recording: this.selfRecording });
    return { battery, storageMB };
  }
  send(msg: MeshMessage) {
    this.bc?.postMessage(msg);
    const raw = JSON.stringify(msg);
    this.channels.forEach((_, ch) => { if (ch.readyState === "open") ch.send(raw); });
  }
  private handle(msg: MeshMessage, via: PeerInfo["via"], ch?: RTCDataChannel) {
    if (msg.from === this.selfId) return;
    if (ch) this.channels.set(ch, msg.from);
    if (msg.type === "bye") { this.peers.delete(msg.from); this.emit(); return; }
    if (msg.type === "ping") { this.send({ type: "pong", from: this.selfId, t: msg.t, to: msg.from }); }
    const existing = this.peers.get(msg.from) ?? { id: msg.from, name: "Camera", battery: null, storageMB: null, latency: null, via, lastSeen: 0, recording: false };
    const next: PeerInfo = { ...existing, via, lastSeen: Date.now() };
    if (msg.type === "telemetry") Object.assign(next, { name: msg.name, battery: msg.battery, storageMB: msg.storageMB, recording: msg.recording });
    if (msg.type === "pong" && msg.to === this.selfId) next.latency = Math.max(1, Math.round((performance.now() - msg.t) / 2));
    this.peers.set(msg.from, next); this.emit();
    this.handlers.forEach((h) => h(msg));
  }
  private wire(ch: RTCDataChannel) {
    this.channels.set(ch, null);
    ch.onopen = () => { void this.sendTelemetry(); this.emit(); };
    ch.onmessage = (e) => { try { this.handle(JSON.parse(String(e.data)) as MeshMessage, "webrtc", ch); } catch { /* ignore malformed frame */ } };
    ch.onclose = () => { const id = this.channels.get(ch); this.channels.delete(ch); if (id) this.peers.delete(id); this.emit(); };
    this.start();
  }

  joinLocal(id: string) {
    this.bc?.close(); this.localId = id;
    this.bc = new BroadcastChannel(`multicam-pov-${id}`);
    this.bc.onmessage = (e) => this.handle(e.data as MeshMessage, "local");
    this.start(); void this.sendTelemetry();
  }
  leave() {
    this.generation++;
    this.send({ type: "bye", from: this.selfId });
    this.bc?.close(); this.bc = null; this.localId = null;
    this.channels.forEach((_, ch) => ch.close()); this.channels.clear();
    this.pending?.close(); this.pending = null;
    this.connections.forEach((pc) => pc.close()); this.connections.clear();
    if (this.timer !== null) clearInterval(this.timer); this.timer = null;
    this.peers.clear(); this.emit();
  }

  async diagnose(): Promise<{ latency: number; bandwidth: number; online: boolean }> {
    if (!this.peers.size) return { latency: 0, bandwidth: 0, online: navigator.onLine };
    const at = performance.now(); let unsubscribe = () => {};
    try {
      const latency = await bounded(new Promise<number>((resolve) => {
        unsubscribe = this.onMessage((message) => { if (message.type === "pong" && message.to === this.selfId && message.t === at) resolve(Math.round((performance.now() - at) / 2)); });
        this.send({ type: "ping", from: this.selfId, t: at });
      }), 2500, "Peer response");
      return { latency, bandwidth: 0, online: navigator.onLine };
    } finally { unsubscribe(); }
  }

  /** Director: create an offer code for one more camera (unlimited, one per camera). */
  async createOffer(session: string) {
    this.pending?.close();
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pending = pc; this.connections.add(pc); const generation = this.generation;
    try {
    this.wire(pc.createDataChannel("pov", { ordered: true }));
    await bounded(pc.setLocalDescription(await bounded(pc.createOffer(), 4000, "Offer")), 4000, "Offer description"); await waitIce(pc);
    if (generation !== this.generation) throw new Error("Session closed");
    const sdp = pc.localDescription?.sdp ?? "";
    return { code: await bounded(encode({ k: "o", s: session, sdp }), 3000, "Offer encoding"), addresses: candidateAddresses(sdp) };
    } catch (error) { pc.close(); this.connections.delete(pc); if (this.pending === pc) this.pending = null; throw error; }
  }
  async acceptAnswer(code: string) {
    const data = await bounded(decode<{ k: string; sdp: string }>(code), 3000, "Answer decoding");
    if (data.k !== "a" || !this.pending) throw new Error("Not an answer");
    await bounded(this.pending.setRemoteDescription({ type: "answer", sdp: data.sdp }), 4000, "Answer description"); this.pending = null;
  }
  /** Camera: answer the director's offer. Returns the reply code + session id. */
  async answerOffer(code: string) {
    const data = await bounded(decode<{ k: string; s: string; sdp: string }>(code), 3000, "Offer decoding");
    if (data.k !== "o") throw new Error("Not an offer");
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.connections.add(pc); const generation = this.generation;
    try {
    pc.ondatachannel = (e) => this.wire(e.channel);
    await bounded(pc.setRemoteDescription({ type: "offer", sdp: data.sdp }), 4000, "Offer description");
    await bounded(pc.setLocalDescription(await bounded(pc.createAnswer(), 4000, "Answer")), 4000, "Answer description"); await waitIce(pc);
    if (generation !== this.generation) throw new Error("Session closed");
    const sdp = pc.localDescription?.sdp ?? "";
    return { code: await bounded(encode({ k: "a", sdp }), 3000, "Answer encoding"), session: data.s, addresses: candidateAddresses(sdp) };
    } catch (error) { pc.close(); this.connections.delete(pc); throw error; }
  }
}

export const mesh = new Mesh();
