// Serverless P2P mesh: WebRTC data channels with QR/copy-paste signaling (LAN, no internet),
// plus BroadcastChannel sessions for windows/tabs on the same device (numeric ID).
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
  const done = () => { if (pc.iceGatheringState === "complete") { pc.removeEventListener("icegatheringstatechange", done); resolve(); } };
  pc.addEventListener("icegatheringstatechange", done); window.setTimeout(resolve, 2500);
});
export const candidateAddresses = (sdp: string) => Array.from(new Set(sdp.split("\n").filter((l) => l.startsWith("a=candidate")).map((l) => { const p = l.split(" "); return `${p[4]}:${p[5]}`; })));

class Mesh {
  selfId = Math.random().toString(36).slice(2, 10);
  name = deviceName();
  peers = new Map<string, PeerInfo>();
  private channels = new Map<RTCDataChannel, string | null>();
  private bc: BroadcastChannel | null = null;
  private pending: RTCPeerConnection | null = null;
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
    this.send({ type: "bye", from: this.selfId });
    this.bc?.close(); this.bc = null; this.localId = null;
    this.channels.forEach((_, ch) => ch.close()); this.channels.clear();
    this.pending?.close(); this.pending = null; this.peers.clear(); this.emit();
  }

  /** Director: create an offer code for one more camera (unlimited, one per camera). */
  async createOffer(session: string) {
    this.pending?.signalingState === "have-local-offer" && this.pending.close();
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.wire(pc.createDataChannel("pov", { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer()); await waitIce(pc);
    this.pending = pc;
    const sdp = pc.localDescription?.sdp ?? "";
    return { code: await encode({ k: "o", s: session, sdp }), addresses: candidateAddresses(sdp) };
  }
  async acceptAnswer(code: string) {
    const data = await decode<{ k: string; sdp: string }>(code);
    if (data.k !== "a" || !this.pending) throw new Error("Not an answer");
    await this.pending.setRemoteDescription({ type: "answer", sdp: data.sdp }); this.pending = null;
  }
  /** Camera: answer the director's offer. Returns the reply code + session id. */
  async answerOffer(code: string) {
    const data = await decode<{ k: string; s: string; sdp: string }>(code);
    if (data.k !== "o") throw new Error("Not an offer");
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.ondatachannel = (e) => this.wire(e.channel);
    await pc.setRemoteDescription({ type: "offer", sdp: data.sdp });
    await pc.setLocalDescription(await pc.createAnswer()); await waitIce(pc);
    const sdp = pc.localDescription?.sdp ?? "";
    return { code: await encode({ k: "a", sdp }), session: data.s, addresses: candidateAddresses(sdp) };
  }
}

export const mesh = new Mesh();
