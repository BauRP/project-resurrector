import { MultiCamNative, isNative, type NativeCameraProfile } from "./native";

export interface CameraCaps {
  available: boolean; deviceId: string | null; label: string;
  /** Candidate modes computed from maximum bounds; not verified supported modes. */
  candidateResolutions?: string[]; candidateFps?: number[];
  maxWidth: number; maxHeight: number; maxFps: number;
  resolutions: string[]; fps: number[]; highSpeed: number[];
  iso: [number, number] | null; exposure: [number, number] | null; focus: [number, number] | null;
  whiteBalance: boolean; colorTemperature: [number, number] | null; torch: boolean; zoom: [number, number] | null;
}
export interface CapabilityMatrix {
  probedAt: number; permissions: { camera: string; microphone: string; storage: string };
  rear: CameraCaps; front: CameraCaps; codecs: string[]; microphones: number; native: boolean;
  /** Per-camera hardware declarations are not proof that a mode records correctly. */
  hardwareCameras?: NativeCameraProfile[];
}
export type Facing = "rear" | "front";
const KEY = "multicam-capability-matrix";
const RES: Record<string, [number, number]> = { "720p": [1280, 720], "1080p": [1920, 1080], "2K": [2560, 1440], "4K": [3840, 2160] };
const CODEC_MIMES: Record<string, string> = { VP8: "video/webm;codecs=vp8,opus", VP9: "video/webm;codecs=vp9,opus", AV1: "video/webm;codecs=av01,opus", "H.264": "video/mp4;codecs=avc1,mp4a.40.2" };
const empty = (): CameraCaps => ({ available: false, deviceId: null, label: "", maxWidth: 0, maxHeight: 0, maxFps: 0, resolutions: [], fps: [], highSpeed: [], iso: null, exposure: null, focus: null, whiteBalance: false, colorTemperature: null, torch: false, zoom: null });

/** Hard ceiling for the whole startup probe. Past this the UI unlocks with whatever was gathered. */
export const PROBE_TIMEOUT_MS = 8000;
/** Ceiling for a single getUserMedia call (emulators can hang forever without resolving). */
const GUM_TIMEOUT_MS = 4000;

class ProbeTimeoutError extends Error { constructor(what: string) { super(`${what} timed out`); this.name = "ProbeTimeoutError"; } }

function withTimeout<T>(p: Promise<T>, ms: number, what: string, onLate?: (v: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new ProbeTimeoutError(what)); }, ms);
    p.then((v) => { if (settled) { onLate?.(v); return; } settled = true; clearTimeout(timer); resolve(v); },
      (e) => { if (settled) return; settled = true; clearTimeout(timer); reject(e); });
  });
}

/** getUserMedia that never hangs: rejects after GUM_TIMEOUT_MS and stops any stream that arrives late. */
function gum(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error("mediaDevices unavailable"));
  let p: Promise<MediaStream>;
  try { p = navigator.mediaDevices.getUserMedia(constraints); } catch (e) { return Promise.reject(e); }
  return withTimeout(p, GUM_TIMEOUT_MS, "getUserMedia", (late) => late.getTracks().forEach((t) => t.stop()));
}

/** Matrix with every camera marked unavailable — used when probing fails, is denied or times out. */
export function emptyCapabilityMatrix(permissions: CapabilityMatrix["permissions"] = { camera: "unavailable", microphone: "unavailable", storage: "unavailable" }): CapabilityMatrix {
  return { probedAt: Date.now(), permissions, rear: empty(), front: empty(), codecs: [], microphones: 0, native: isNative() };
}
export const makeUnavailableMatrix = emptyCapabilityMatrix;

export function loadMatrix(): CapabilityMatrix | null {
  try { const raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) as CapabilityMatrix : null; } catch { return null; }
}

async function probeCamera(facingMode: "environment" | "user"): Promise<CameraCaps> {
  let stream: MediaStream | null = null;
  let usedUnspecifiedFallback=false;
  try {
    stream = await gum({ video: { facingMode: { exact: facingMode } }, audio: false });
  } catch {
    if (facingMode === "user") return empty();
    try {
      stream = await gum({ video: true, audio: false });
      usedUnspecifiedFallback=true;
    } catch { return empty(); }
  }
  try {
    const track=stream.getVideoTracks()[0];
    // getUserMedia resolving is NOT proof that a usable lens was opened.
    if(!track || track.readyState!=="live")return empty();
    const tc=(track.getCapabilities?.() ?? {}) as Record<string,unknown>;
    const settings=track.getSettings?.() ?? {};
    // If the requested rear stream fell back to video:true, WebView may
    // actually have opened a selfie camera. Never assign that camera the
    // rear passport or lens capabilities when the observed facing disagrees.
    const actualFacing=settings.facingMode;
    // A generic video:true fallback does not establish rear lens identity.
    // If the browser does not disclose facingMode, preserve unknown instead.
    if((usedUnspecifiedFallback && actualFacing!=="environment") ||
       (facingMode==="environment" && actualFacing==="user") ||
       (facingMode==="user" && actualFacing==="environment"))
      return empty();
    const range=(k:string):[number,number]|null=>{
      const r=tc[k] as {min?:number;max?:number}|undefined;
      const min=r?.min,max=r?.max;
      return typeof min==="number" && typeof max==="number" &&
        Number.isFinite(min) && Number.isFinite(max) && min>=0 && max>min ?
          [min,max] : null;
    };
    const max=(k:string)=>{
      const raw=(tc[k] as {max?:number}|undefined)?.max;
      return typeof raw==="number" && Number.isFinite(raw) && raw>0 ? raw : 0;
    };
    const w=max("width"),h=max("height"),f=max("frameRate");
    const wbModes=tc["whiteBalanceMode"];
    const id=typeof settings.deviceId==="string"&&settings.deviceId ?
      settings.deviceId : null;
    return {
      available:true,deviceId:id,label:track.label??"",
      maxWidth:w,maxHeight:h,maxFps:f,
      // Capability maxima are candidates, never proof of decoded recording.
      resolutions:[],candidateResolutions:Object.entries(RES)
        .filter(([, [rw,rh]])=>!w||!h||(rw<=Math.max(w,h)&&rh<=Math.min(w,h)+1))
        .map(([k])=>k),
      fps:[],candidateFps:[24,30,60].filter(x=>!f||x<=f),highSpeed:[],
      iso:range("iso"),exposure:range("exposureTime"),focus:range("focusDistance"),
      whiteBalance:Array.isArray(wbModes)&&wbModes.includes("manual"),
      colorTemperature:range("colorTemperature"),torch:tc["torch"]===true,zoom:range("zoom"),
    };
  }catch{
    // Broken OEM getCapabilities/getSettings calls are unknown, not success.
    return empty();
  }finally{
    // Including a missing-track stream or a throwing OEM capability getter.
    stream.getTracks().forEach(t=>t.stop());
  }
}

/** Runs real permission requests and hardware probes, reporting each stage. Duration = real execution time. */
export async function probeDevice(
  onStage: (stage: number, progress: number) => void, signal?: AbortSignal,
): Promise<CapabilityMatrix> {
  // The startup splash may already have timed out/unmounted. A late probe
  // must never publish old camera results over the active session's passport.
  const stage=(index:number,percent:number)=>{
    if(!signal?.aborted)onStage(index,percent);
  };
  stage(0, 5);
  const permissions = { camera: "denied", microphone: "denied", storage: "denied" };
  try {
    const s=await gum({video:true,audio:true});
    try{
      // A resolved stream is not proof that an OEM supplied both tracks.
      // Device permissions and functionality must be recorded separately.
      if(s.getVideoTracks().some(t=>t.readyState==="live"))permissions.camera="granted";
      if(s.getAudioTracks?.().some(t=>t.readyState==="live"))permissions.microphone="granted";
    }finally{s.getTracks().forEach(t=>t.stop());}
  }
  catch {
    // A timed-out first-run check must not start *new* camera/microphone
    // requests after the app UI has already opened or ownership changed.
    if(!signal?.aborted){
      try {
        const s=await gum({video:true,audio:false});
        try{if(s.getVideoTracks().some(t=>t.readyState==="live"))permissions.camera="granted";}
        finally{s.getTracks().forEach(t=>t.stop());}
      }catch{/* camera refused */}
    }
    if(!signal?.aborted){
      try {
        const s=await gum({audio:true,video:false});
        try{if(s.getAudioTracks?.().some(t=>t.readyState==="live"))permissions.microphone="granted";}
        finally{s.getTracks().forEach(t=>t.stop());}
      }catch{/* mic refused */}
    }
  }
  // If an OEM returns only one media track for the combined request, never
  // mark the missing track granted just from the HTTP/API resolution.
  if(permissions.camera!=="granted"&&!signal?.aborted){
    try{
      const s=await gum({video:true,audio:false});
      try{if(s.getVideoTracks().some(t=>t.readyState==="live"))permissions.camera="granted";}
      finally{s.getTracks().forEach(t=>t.stop());}
    }catch{/* unavailable or denied; never fabricate a granted permission */}
  }
  if(permissions.microphone!=="granted"&&!signal?.aborted){
    try{
      const s=await gum({audio:true,video:false});
      try{if(s.getAudioTracks?.().some(t=>t.readyState==="live"))permissions.microphone="granted";}
      finally{s.getTracks().forEach(t=>t.stop());}
    }catch{/* unavailable or denied */}
  }
  try { const persisted = await withTimeout(Promise.resolve(navigator.storage?.persist?.()), 2000, "storage.persist"); permissions.storage = persisted ? "granted" : "prompt"; if (!persisted) permissions.storage = "granted-temporary"; } catch { permissions.storage = "unavailable"; }
  if(signal?.aborted)return emptyCapabilityMatrix({camera:"timeout",microphone:"unavailable",storage:"unavailable"});
  stage(1, 30);
  const rear = !signal?.aborted && permissions.camera === "granted" ? await probeCamera("environment") : empty();
  if(signal?.aborted)return emptyCapabilityMatrix({camera:"timeout",microphone:"unavailable",storage:"unavailable"});
  stage(2, 60);
  const front = !signal?.aborted && permissions.camera === "granted" ? await probeCamera("user") : empty();
  if (front.available && rear.available && front.deviceId && front.deviceId === rear.deviceId) Object.assign(front, empty());
  if(signal?.aborted)return emptyCapabilityMatrix({camera:"timeout",microphone:"unavailable",storage:"unavailable"});
  stage(3, 80);
  const devices = await withTimeout(navigator.mediaDevices?.enumerateDevices?.() ?? Promise.resolve([] as MediaDeviceInfo[]), 2000, "enumerateDevices").catch(() => [] as MediaDeviceInfo[]);
  const codecs = typeof MediaRecorder === "undefined" ? [] : Object.entries(CODEC_MIMES).filter(([, m]) => MediaRecorder.isTypeSupported(m)).map(([k]) => k);
  let hardwareCameras: NativeCameraProfile[] = [];
  if (isNative() && !signal?.aborted) {
    try {
      const n = await withTimeout(MultiCamNative.getCapabilities(), 3000, "native capabilities");
      hardwareCameras = n.cameras;
      for (const cam of n.cameras) {
        const target = cam.facing === "front" ? front : rear;
        // High-speed capabilities belong to their actual native camera ID.
        // Do not pool modes from incompatible lenses into front/rear UI controls.
        if (cam.isoRange && !target.iso) target.iso = cam.isoRange;
      }
    } catch { /* native plugin unavailable */ }
  }
  const matrix: CapabilityMatrix = { probedAt: Date.now(), permissions, rear, front, codecs, microphones: devices.filter((d) => d.kind === "audioinput").length, native: isNative(), hardwareCameras };
  // A stale response from Android/WebView is never allowed to overwrite
  // the current cached passport after a splash timeout or unmount.
  if(signal?.aborted)return emptyCapabilityMatrix({camera:"timeout",microphone:"unavailable",storage:"unavailable"});
  try { window.localStorage.setItem(KEY, JSON.stringify(matrix)); } catch { /* memory only */ }
  stage(3, 100);
  return matrix;
}


/**
 * Startup-safe probe: never rejects and never takes longer than PROBE_TIMEOUT_MS.
 * On timeout/failure it returns the cached matrix if one exists, else an all-unavailable matrix,
 * so Camera (simulated feed), Editor and Settings unlock immediately.
 */
export async function probeDeviceSafe(
  onStage: (stage: number, progress: number) => void,
  timeoutMs = PROBE_TIMEOUT_MS, externalSignal?: AbortSignal,
): Promise<CapabilityMatrix> {
  const controller=new AbortController();
  const onExternalAbort=()=>controller.abort();
  externalSignal?.addEventListener("abort",onExternalAbort,{once:true});
  if(externalSignal?.aborted)controller.abort();
  try {
    if(controller.signal.aborted)throw new ProbeTimeoutError("startup probe cancelled");
    return await withTimeout(probeDevice(onStage,controller.signal), timeoutMs, "device probe");
  } catch (e) {
    controller.abort();
    console.warn("[capabilities] probe fallback:", e instanceof Error ? e.message : e);
    const cached = loadMatrix();
    const m = cached ?? emptyCapabilityMatrix({ camera: e instanceof ProbeTimeoutError ? "timeout" : "denied", microphone: "unavailable", storage: "unavailable" });
    if(!externalSignal?.aborted)onStage(3, 100);
    return m;
  } finally {
    externalSignal?.removeEventListener("abort",onExternalAbort);
  }
}
