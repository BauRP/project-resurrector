import { MultiCamNative, isNative } from "./native";

export interface CameraCaps {
  available: boolean; deviceId: string | null; label: string;
  maxWidth: number; maxHeight: number; maxFps: number;
  resolutions: string[]; fps: number[]; highSpeed: number[];
  iso: [number, number] | null; exposure: [number, number] | null; focus: [number, number] | null;
  whiteBalance: boolean; colorTemperature: [number, number] | null; torch: boolean; zoom: [number, number] | null;
}
export interface CapabilityMatrix {
  probedAt: number; permissions: { camera: string; microphone: string; storage: string };
  rear: CameraCaps; front: CameraCaps; codecs: string[]; microphones: number; native: boolean;
}
export type Facing = "rear" | "front";
const KEY = "multicam-capability-matrix";
const RES: Record<string, [number, number]> = { "720p": [1280, 720], "1080p": [1920, 1080], "2K": [2560, 1440], "4K": [3840, 2160] };
const CODEC_MIMES: Record<string, string> = { VP8: "video/webm;codecs=vp8,opus", VP9: "video/webm;codecs=vp9,opus", AV1: "video/webm;codecs=av01,opus", "H.264": "video/mp4;codecs=avc1,mp4a.40.2" };
const empty = (): CameraCaps => ({ available: false, deviceId: null, label: "", maxWidth: 0, maxHeight: 0, maxFps: 0, resolutions: [], fps: [], highSpeed: [], iso: null, exposure: null, focus: null, whiteBalance: false, colorTemperature: null, torch: false, zoom: null });

export function loadMatrix(): CapabilityMatrix | null {
  try { const raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) as CapabilityMatrix : null; } catch { return null; }
}

async function probeCamera(facingMode: "environment" | "user"): Promise<CameraCaps> {
  let stream: MediaStream | null = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { exact: facingMode } }, audio: false });
  } catch {
    if (facingMode === "user") return empty();
    try { stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false }); } catch { return empty(); }
  }
  const track = stream.getVideoTracks()[0];
  const tc = (track?.getCapabilities?.() ?? {}) as Record<string, unknown>;
  stream.getTracks().forEach((t) => t.stop());
  const range = (k: string): [number, number] | null => { const r = tc[k] as { min?: number; max?: number } | undefined; return r && typeof r.max === "number" && r.max > (r.min ?? 0) ? [r.min ?? 0, r.max] : null; };
  const w = (tc["width"] as { max?: number })?.max ?? 0; const h = (tc["height"] as { max?: number })?.max ?? 0; const f = (tc["frameRate"] as { max?: number })?.max ?? 0;
  const long = Math.max(w, h); const short = Math.min(w, h);
  const wbModes = (tc["whiteBalanceMode"] as string[] | undefined) ?? [];
  return {
    available: true, deviceId: (tc["deviceId"] as string) ?? track?.getSettings().deviceId ?? null, label: track?.label ?? "",
    maxWidth: w, maxHeight: h, maxFps: f,
    resolutions: Object.entries(RES).filter(([, [rw, rh]]) => !long || (rw <= long && rh <= short + 1)).map(([k]) => k),
    fps: [24, 30, 60].filter((x) => !f || x <= f), highSpeed: [],
    iso: range("iso"), exposure: range("exposureTime"), focus: range("focusDistance"),
    whiteBalance: wbModes.includes("manual"), colorTemperature: range("colorTemperature"), torch: tc["torch"] === true, zoom: range("zoom"),
  };
}

/** Runs real permission requests and hardware probes, reporting each stage. Duration = real execution time. */
export async function probeDevice(onStage: (stage: number, progress: number) => void): Promise<CapabilityMatrix> {
  onStage(0, 5);
  const permissions = { camera: "denied", microphone: "denied", storage: "denied" };
  try { const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true }); s.getTracks().forEach((t) => t.stop()); permissions.camera = "granted"; permissions.microphone = "granted"; }
  catch {
    try { const s = await navigator.mediaDevices.getUserMedia({ video: true }); s.getTracks().forEach((t) => t.stop()); permissions.camera = "granted"; } catch { /* camera refused */ }
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); permissions.microphone = "granted"; } catch { /* mic refused */ }
  }
  try { const persisted = await navigator.storage?.persist?.(); permissions.storage = persisted ? "granted" : "prompt"; await navigator.storage?.estimate?.(); if (!persisted) permissions.storage = "granted-temporary"; } catch { permissions.storage = "unavailable"; }
  onStage(1, 30);
  const rear = permissions.camera === "granted" ? await probeCamera("environment") : empty();
  onStage(2, 60);
  const front = permissions.camera === "granted" ? await probeCamera("user") : empty();
  if (front.available && rear.available && front.deviceId && front.deviceId === rear.deviceId) Object.assign(front, empty());
  onStage(3, 80);
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
  const codecs = typeof MediaRecorder === "undefined" ? [] : Object.entries(CODEC_MIMES).filter(([, m]) => MediaRecorder.isTypeSupported(m)).map(([k]) => k);
  if (isNative()) {
    try {
      const n = await MultiCamNative.getCapabilities();
      for (const cam of n.cameras) {
        const target = cam.facing === "front" ? front : rear;
        target.highSpeed = [...new Set([...target.highSpeed, ...cam.highSpeed.flatMap((h) => h.fps)])];
        if (cam.isoRange && !target.iso) target.iso = cam.isoRange;
      }
    } catch { /* native plugin unavailable */ }
  }
  const matrix: CapabilityMatrix = { probedAt: Date.now(), permissions, rear, front, codecs, microphones: devices.filter((d) => d.kind === "audioinput").length, native: isNative() };
  try { window.localStorage.setItem(KEY, JSON.stringify(matrix)); } catch { /* memory only */ }
  onStage(3, 100);
  return matrix;
}
