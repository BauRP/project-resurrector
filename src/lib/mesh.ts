// Serverless P2P mesh: WebRTC data channels with QR/copy-paste signaling (LAN, no internet),
// plus BroadcastChannel sessions for windows/tabs on the same device (numeric ID).
import { bounded } from "./async";
export type RemoteRecordStatus = "received" | "recording" | "stopping" | "saved" | "error";
export interface PeerInfo {
  id: string; name: string; battery: number | null; storageMB: number | null;
  latency: number | null; via: "webrtc" | "local"; lastSeen: number;
  recording: boolean;
  /** This is a reported stage, not proof of exact frame synchronization. */
  recordStatus?: RemoteRecordStatus;
  recordCommandAt?: number;
}
export type MeshMessage =
  | { type: "telemetry"; from: string; name: string; battery: number | null; storageMB: number | null; recording: boolean }
  | { type: "record"; from: string; on: boolean; at: number }
  | { type: "record-result"; from: string; to: string; at: number; status: RemoteRecordStatus }
  | { type: "ping"; from: string; t: number; to?: string }
  | { type: "pong"; from: string; t: number; to: string }
  | { type: "bye"; from: string };

export function isValidMeshMessage(message:unknown):message is MeshMessage{
  if(!message||typeof message!=="object")return false;
  const m=message as Record<string,unknown>;
  if(typeof m["from"]!=="string"||m["from"].length<1||
     m["from"].length>64||!/^[a-zA-Z0-9_-]+$/.test(m["from"]))return false;
  switch(m["type"]){
    case "bye":return true;
    case "ping":return Number.isFinite(m["t"])&&typeof m["t"]==="number"&&m["t"]>=0;
    case "pong":return typeof m["to"]==="string"&&m["to"].length>0&&
      m["to"].length<=64&&typeof m["t"]==="number"&&
      Number.isFinite(m["t"])&&m["t"]>=0;
    case "record":return typeof m["on"]==="boolean"&&
      typeof m["at"]==="number"&&Number.isSafeInteger(m["at"])&&m["at"]>0;
    case "record-result":return typeof m["to"]==="string"&&
      /^[a-zA-Z0-9_-]{1,64}$/.test(m["to"])&&
      typeof m["at"]==="number"&&Number.isSafeInteger(m["at"])&&m["at"]>0&&
      ["received","recording","stopping","saved","error"].includes(String(m["status"]));
    case "telemetry":return typeof m["name"]==="string"&&m["name"].length<=128&&
      typeof m["recording"]==="boolean"&&
      (m["battery"]===null||(typeof m["battery"]==="number"&&
        Number.isFinite(m["battery"])&&m["battery"]>=0&&m["battery"]<=100))&&
      (m["storageMB"]===null||(typeof m["storageMB"]==="number"&&
        Number.isFinite(m["storageMB"])&&m["storageMB"]>=0));
    default:return false;
  }
}
/** A late lower-stage acknowledgement may not overwrite actual completion. */
export function recordStatusOrder(status: RemoteRecordStatus | undefined): number {
  return status === "received" ? 0 : status === "recording" ? 1 :
    status === "stopping" ? 2 : status === "saved" || status === "error" ? 3 : -1;
}
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
  // QR/copy-paste data is untrusted. Bound input before allocating decoded
  // blobs or inflating compressed SDP, including on old Android WebViews.
  if (typeof code !== "string" || code.length > 65536)
    throw new Error("Код подключения слишком большой");
  const [prefix, body = ""] = code.trim().split(".");
  if ((prefix !== "P0" && prefix !== "P1") || !/^[A-Za-z0-9_-]{1,65530}$/.test(body))
    throw new Error("Недействительный код подключения");
  const bin = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
  let bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (prefix === "P1") {
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 65536) throw new Error("Слишком большой ответ подключения");
        parts.push(next.value);
      }
    } finally {
      void reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  }
  if (bytes.byteLength > 65536) throw new Error("Слишком большой ответ подключения");
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
  private pendingAnswer: RTCPeerConnection | null = null;
  private connections = new Set<RTCPeerConnection>();
  private generation = 0;
  private answerEpoch = 0;
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
    // OEM WebViews can hang getBattery()/storage.estimate() while Activity
    // changes. Telemetry must still arrive so the remote controller can
    // identify its peer; unknown metrics are valid and never fabricated.
    try {
      const getBattery = (navigator as Navigator & { getBattery?: () => Promise<{level:number}> }).getBattery;
      if (getBattery) {
        const value = await bounded(getBattery.call(navigator), 750, "Battery telemetry");
        if (Number.isFinite(value.level))
          battery = Math.round(Math.max(0, Math.min(1, value.level)) * 100);
      }
    } catch { battery = null; }
    try {
      const estimate = navigator.storage?.estimate?.();
      if (estimate) {
        const value = await bounded(estimate, 750, "Storage telemetry");
        if (Number.isFinite(value.quota) && Number.isFinite(value.usage))
          storageMB = Math.max(0, Math.round(((value.quota ?? 0) - (value.usage ?? 0)) / 1048576));
      }
    } catch { storageMB = null; }
    this.send({ type: "telemetry", from: this.selfId, name: this.name, battery, storageMB, recording: this.selfRecording });
    return { battery, storageMB };
  }
  send(msg: MeshMessage) {
    try{this.bc?.postMessage(msg);}
    catch{
      // Android WebView may close BroadcastChannel during background/fold
      // recreation. Continue serving other real WebRTC cameras.
      try{this.bc?.close();}catch{/* channel already invalid */}
      this.bc=null;this.localId=null;
    }
    const raw = JSON.stringify(msg);
    this.channels.forEach((id, ch) => {
      if(ch.readyState!=="open")return;
      try{ch.send(raw);}
      catch{
        // When Wi-Fi drops between readyState check and send(), don't crash
        // the entire director session or leave a phantom connected camera.
        this.channels.delete(ch);
        if(id && !Array.from(this.channels.values()).includes(id))
          this.peers.delete(id);
        try{ch.close();}catch{/* channel is already lost */}
        this.emit();
      }
    });
  }
  private handle(msg: MeshMessage, via: PeerInfo["via"], ch?: RTCDataChannel) {
    // A QR-linked peer or local BroadcastChannel is not a trusted parser.
    // Refuse malformed/unbounded messages before they create phantom peers
    // or trigger recording commands from invalid network input.
    if(!isValidMeshMessage(msg))return;
    if (msg.from === this.selfId) return;
    if (ch) {
      // WebRTC data channels belong to one peer identity. A malformed or
      // delayed packet from a reused channel cannot impersonate a second
      // phone or kick out a newly reconnected recorder.
      const boundId=this.channels.get(ch);
      if(boundId && boundId!==msg.from)return;
      if(!this.channels.has(ch))return;
      // A just-opened WebRTC channel may not issue START/STOP by borrowing
      // the identity of a peer seen on a different connection. Bind its
      // identity from earlier non-control traffic on this SAME channel.
      if((msg.type==="record" || msg.type==="record-result") && boundId!==msg.from)return;
      this.channels.set(ch,msg.from);
    }
    // A new packet must not register itself as a trusted connected camera
    // merely by claiming to be a remote RECORD command. Require an existing
    // live peer established by earlier telemetry/pairing traffic.
    if ((msg.type === "record" || msg.type === "record-result") &&
        (!this.peers.has(msg.from) ||
         Date.now() - this.peers.get(msg.from)!.lastSeen >= 12000)) return;
    if (msg.type === "record-result") {
      if (msg.to !== this.selfId) return;
      const peer = this.peers.get(msg.from)!;
      if (peer.recordCommandAt !== undefined &&
          (msg.at < peer.recordCommandAt ||
           (msg.at === peer.recordCommandAt &&
            recordStatusOrder(msg.status) <= recordStatusOrder(peer.recordStatus)))) return;
    }
    if (msg.type === "bye") {
      // A retiring channel may say bye after a replacement was paired.
      if ((ch && Array.from(this.channels.entries()).some(([other,id])=>
        other!==ch && id===msg.from && other.readyState==="open")) ||
          (!ch && via === "local" && Array.from(this.channels.entries()).some(([channel,id])=>
            id === msg.from && channel.readyState === "open"))) return;
      this.peers.delete(msg.from);this.emit();return;
    }
    if (msg.type === "ping") { this.send({ type: "pong", from: this.selfId, t: msg.t, to: msg.from }); }
    const existing = this.peers.get(msg.from) ?? { id: msg.from, name: "Camera", battery: null, storageMB: null, latency: null, via, lastSeen: 0, recording: false };
    const next: PeerInfo = { ...existing, via, lastSeen: Date.now() };
    if (msg.type === "telemetry") Object.assign(next, { name: msg.name, battery: msg.battery, storageMB: msg.storageMB, recording: msg.recording });
    if (msg.type === "record-result") Object.assign(next, {
      recordStatus: msg.status, recordCommandAt: msg.at,
      recording: msg.status === "recording" ? true :
        ["saved","error"].includes(msg.status) ? false : next.recording,
    });
    if (msg.type === "pong" && msg.to === this.selfId) next.latency = Math.max(1, Math.round((performance.now() - msg.t) / 2));
    this.peers.set(msg.from, next); this.emit();
    this.handlers.forEach((h) => h(msg));
  }
  private wire(ch: RTCDataChannel) {
    this.channels.set(ch, null);
    ch.onopen = () => { void this.sendTelemetry(); this.emit(); };
    ch.onmessage = (e) => {
      // Reject oversized or binary frames before JSON.parse allocates large
      // objects on low-memory WebViews during recording or folding.
      if (typeof e.data !== "string" || e.data.length > 8192) return;
      try { this.handle(JSON.parse(e.data) as MeshMessage, "webrtc", ch); }
      catch { /* ignore malformed frame */ }
    };
    ch.onclose = () => {
      if (!this.channels.has(ch)) return;
      const id=this.channels.get(ch);this.channels.delete(ch);
      // A reconnect may already have established a new channel for the
      // same peer. A late close must not make that healthy peer disappear.
      if(id && !Array.from(this.channels.values()).includes(id))
        this.peers.delete(id);
      this.emit();
    };
    this.start();
  }

  joinLocal(id: string) {
    this.bc?.close(); this.localId = id;
    const channel = new BroadcastChannel(`multicam-pov-${id}`);
    this.bc = channel;
    // Android may deliver queued messages from an old BroadcastChannel even
    // after switching local sessions. Ignore them instead of allowing old
    // director START/STOP to reach the newly paired camera.
    channel.onmessage = (e) => {
      if (this.bc !== channel || this.localId !== id) return;
      this.handle(e.data as MeshMessage, "local");
    };
    this.start(); void this.sendTelemetry();
  }
  leave() {
    this.generation++;
    this.answerEpoch++;
    this.send({ type: "bye", from: this.selfId });
    this.bc?.close(); this.bc = null; this.localId = null;
    this.channels.forEach((_, ch) => ch.close()); this.channels.clear();
    this.pending?.close(); this.pending = null;
    this.pendingAnswer?.close(); this.pendingAnswer = null;
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
    // A replaced offer is not an active camera; retire its connection now,
    // without affecting other established director-to-camera channels.
    if (this.pending) {
      this.pending.close();
      this.connections.delete(this.pending);
    }
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pending = pc; this.connections.add(pc); const generation = this.generation;
    try {
    this.wire(pc.createDataChannel("pov", { ordered: true }));
    await bounded(pc.setLocalDescription(await bounded(pc.createOffer(), 4000, "Offer")), 4000, "Offer description"); await waitIce(pc);
    if (generation !== this.generation || this.pending !== pc)
      throw new Error("Устаревшее предложение подключения: создан новый QR-код");
    const sdp = pc.localDescription?.sdp ?? "";
    const code = await bounded(encode({ k: "o", s: session, sdp }), 3000, "Offer encoding");
    // Encoding/compression can also finish after another offer replaces this one.
    if (generation !== this.generation || this.pending !== pc)
      throw new Error("Устаревшее предложение подключения: создан новый QR-код");
    return { code, addresses: candidateAddresses(sdp) };
    } catch (error) { pc.close(); this.connections.delete(pc); if (this.pending === pc) this.pending = null; throw error; }
  }
  async acceptAnswer(code: string) {
    const generation=this.generation;
    const pc=this.pending;
    const data=await bounded(decode<{k:string;sdp:string}>(code),3000,"Answer decoding");
    // A replacement QR session or leave() may have invalidated this offer
    // while an async answer was being decoded. Never mutate the new offer.
    if(data.k!=="a"||!pc||this.pending!==pc||generation!==this.generation)
      throw new Error("Устаревший или недействительный ответ подключения");
    await bounded(pc.setRemoteDescription({type:"answer",sdp:data.sdp}),4000,"Answer description");
    if(this.pending!==pc||generation!==this.generation)
      throw new Error("Сеанс подключения сменился во время подтверждения");
    this.pending=null;
  }
  /** Camera: answer the director's offer. Returns the reply code + session id. */
  async answerOffer(code: string) {
    const generation = this.generation;
    const answerEpoch = ++this.answerEpoch;
    // A cancelled or superseded scan must not keep an orphan Camera-side
    // RTCPeerConnection running in the background after an Activity remount.
    if (this.pendingAnswer) {
      this.pendingAnswer.close();
      this.connections.delete(this.pendingAnswer);
      this.pendingAnswer = null;
    }
    const current = () => generation === this.generation && answerEpoch === this.answerEpoch;
    const data = await bounded(decode<{ k: string; s: string; sdp: string }>(code), 3000, "Offer decoding");
    if (!current()) throw new Error("Устаревшее приглашение: начато новое подключение");
    if (data.k !== "o") throw new Error("Not an offer");
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.connections.add(pc);
    this.pendingAnswer = pc;
    let established = false;
    try {
    pc.ondatachannel = (e) => {
      if (!this.connections.has(pc) || (!established && !current())) {
        e.channel.close();
        return;
      }
      this.wire(e.channel);
    };
    await bounded(pc.setRemoteDescription({ type: "offer", sdp: data.sdp }), 4000, "Offer description");
    if (!current()) throw new Error("Устаревшее приглашение: начато новое подключение");
    const description = await bounded(pc.createAnswer(), 4000, "Answer");
    if (!current()) throw new Error("Устаревшее приглашение: начато новое подключение");
    await bounded(pc.setLocalDescription(description), 4000, "Answer description");
    await waitIce(pc);
    if (!current()) throw new Error("Устаревшее приглашение: начато новое подключение");
    const sdp = pc.localDescription?.sdp ?? "";
    const reply = await bounded(encode({ k: "a", sdp }), 3000, "Answer encoding");
    if (!current()) throw new Error("Устаревшее приглашение: начато новое подключение");
    established = true;
    if (this.pendingAnswer === pc) this.pendingAnswer = null;
    return { code: reply, session: data.s, addresses: candidateAddresses(sdp) };
    } catch (error) {
      pc.close();
      this.connections.delete(pc);
      if (this.pendingAnswer === pc) this.pendingAnswer = null;
      throw error;
    }
  }
}

export const mesh = new Mesh();
