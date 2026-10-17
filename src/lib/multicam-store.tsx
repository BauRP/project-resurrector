import type React from "react";
import type { CapabilityMatrix, Facing } from "./capabilities";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AppTab = "camera" | "editor" | "settings";
export type Role = "solo" | "host" | "slave";
export type GridMode = "off" | "thirds" | "golden" | "level" | "cross";
export interface Marker { id: string; time: number; label: string }
export interface Cut { id: string; time: number; camera: number }
export interface Subtitle { id: string; start: number; end: number; text: string }
interface ExportConfig { aspect: string; resolution: string; fps: string; videoCodec: string; bitrate: number; audioCodec: string; sampleRate: string; audioBitrate: number }
export type CaptureMode = "normal" | "slowmo120" | "slowmo240" | "timelapse" | "hyperlapse";
export interface ShootSettings { timer: number; burst: boolean; bracket: boolean; interval: number; raw: boolean; night: boolean; longExp: boolean }
export type FocusModeAI = "continuous" | "face" | "hybrid_nearest_priority";
export type MeterMode = "matrix" | "center" | "spot";
export type ToneProfile = "standard" | "log" | "flat" | "directlog";
export interface CaptureConfig { resolution: string; fps: number; codec: string; mode: CaptureMode; profile: ToneProfile; micId: string; iso: number | null; focus: number | null; exposure: number | null }
interface StateData {
  tab: AppTab; role: Role; sessionCode: string; recording: boolean; recordingStartedAt: number | null;
  markers: Marker[]; cuts: Cut[]; activeCamera: number; playhead: number; duration: number; playing: boolean;
  focusPeaking: boolean; zebras: boolean; wbLock: boolean; isoLock: boolean; grid: GridMode;
  shutter: string; anamorphic: string; distortion: number; dualCamera: boolean; tracking: boolean;
  teleprompter: boolean; teleprompterText: string; teleprompterSpeed: number; teleprompterSize: number; touchLocked: boolean;
  selectedLut: string; customLutName: string; transition: string; chromaEnabled: boolean; chromaColor: string; chromaTolerance: number; chromaSmoothness: number;
  eq: number[]; deEsser: boolean; noiseReduction: number; autoGain: boolean; subtitles: Subtitle[];
  aspect: string; editMode: string; speed: number; scale: number; posX: number; posY: number; opacity: number;
  language: string; hardwareAcceleration: boolean; cacheMB: number; diagnostics: { latency: number; bandwidth: number; online: boolean };
  exportOpen: boolean; mediaOpen: boolean; exportProgress: number; exportConfig: ExportConfig;
  capture: CaptureConfig; paused: boolean; wbKelvin: number | null; cleanFrame: boolean;
  capMatrix: CapabilityMatrix | null; facing: Facing;
  exportMix: { excludedAudio: string[]; hiddenVideo: string[] };
  captureKind: "photo" | "video"; aiEnabled: boolean; eyeAF: boolean; focusModeAI: FocusModeAI; meterMode: MeterMode; falseColor: boolean; audioUi: boolean; audioGain: number; audioCeiling: number;
  tint: number; tuneContrast: number; tuneShadows: number; tuneSaturation: number; shoot: ShootSettings; zoom: number; lensDeviceId: string;
}
export interface MulticamState extends StateData {
  set: (patch: Partial<StateData>) => void; setTab: (tab: AppTab) => void; startSession: (role: Role) => void;
  toggleRecording: () => void; addMarker: () => void; switchCamera: (camera: number) => void;
  setEqBand: (index: number, value: number) => void; addSubtitles: () => void; updateSubtitle: (id: string, text: string) => void;
  applyPreset: (preset: "cinema" | "reels" | "draft") => void; resetProject: () => void;
}
const makeId = () => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
const projectDefaults = { markers: [] as Marker[], cuts: [] as Cut[], subtitles: [] as Subtitle[], playhead: 0, duration: 62, activeCamera: 1, playing: false };
const defaults: StateData = {
  tab: "camera", role: "solo", sessionCode: "POV-842", recording: false, recordingStartedAt: null, ...projectDefaults,
  focusPeaking: false, zebras: false, wbLock: false, isoLock: false, grid: "thirds", shutter: "1/48", anamorphic: "off", distortion: 0, dualCamera: false, tracking: true,
  teleprompter: false, teleprompterText: "Welcome to MULTI-CAM POV. Keep your eyes on the lens and tell the story.", teleprompterSpeed: 35, teleprompterSize: 24, touchLocked: false,
  selectedLut: "Neutral", customLutName: "", transition: "Dissolve", chromaEnabled: false, chromaColor: "#36d462", chromaTolerance: 35, chromaSmoothness: 20,
  eq: Array(10).fill(0) as number[], deEsser: false, noiseReduction: 20, autoGain: true, aspect: "16:9", editMode: "Cut", speed: 1, scale: 100, posX: 0, posY: 0, opacity: 100,
  language: "ru", hardwareAcceleration: true, cacheMB: 0, diagnostics: { latency: 0, bandwidth: 0, online: true }, exportOpen: false, mediaOpen: false, exportProgress: 0,
  capture: { resolution: "1080p", fps: 30, codec: "VP9", mode: "normal", profile: "standard", micId: "", iso: null, focus: null, exposure: null }, paused: false, wbKelvin: null, cleanFrame: false, capMatrix: null, facing: "rear", exportMix: { excludedAudio: [], hiddenVideo: [] },
  captureKind: "video", aiEnabled: false, eyeAF: false, focusModeAI: "continuous", meterMode: "matrix", falseColor: false, audioUi: false, audioGain: 1, audioCeiling: -24,
  tint: 0, tuneContrast: 0, tuneShadows: 0, tuneSaturation: 0, shoot: { timer: 0, burst: false, bracket: false, interval: 0, raw: false, night: false, longExp: false }, zoom: 1, lensDeviceId: "",
  exportConfig: { aspect: "16:9", resolution: "4K", fps: "24", videoCodec: "H.264", bitrate: 48, audioCodec: "AAC", sampleRate: "48kHz", audioBitrate: 256 },
};
// Keep one context instance across hot reloads so provider and consumers always match.
const g = globalThis as { __multicamStoreCtx?: React.Context<MulticamState | null> };
const StoreContext = g.__multicamStoreCtx ??= createContext<MulticamState | null>(null);

export function MulticamStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StateData>(defaults);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("multicam-pov-state-native");
      if (saved) setData((current) => ({ ...current, ...JSON.parse(saved) as Partial<StateData> }));
    } catch { /* A restricted webview can disable local storage. */ }
  }, []);
  useEffect(() => {
    try {
      const { language, hardwareAcceleration, selectedLut, exportConfig, markers, cuts, subtitles, teleprompterText, teleprompterSpeed, teleprompterSize } = data;
      window.localStorage.setItem("multicam-pov-state-native", JSON.stringify({ language, hardwareAcceleration, selectedLut, exportConfig, markers, cuts, subtitles, teleprompterText, teleprompterSpeed, teleprompterSize }));
    } catch { /* State remains available for this session. */ }
  }, [data.language, data.hardwareAcceleration, data.selectedLut, data.exportConfig, data.markers, data.cuts, data.subtitles, data.teleprompterText, data.teleprompterSpeed, data.teleprompterSize]);

  const value = useMemo<MulticamState>(() => ({
    ...data,
    set: (patch) => setData((current) => ({ ...current, ...patch })),
    setTab: (tab) => setData((current) => ({ ...current, tab })),
    startSession: (role) => setData((current) => ({ ...current, role, sessionCode: `POV-${Math.floor(100 + Math.random() * 900)}` })),
    toggleRecording: () => setData((current) => current.role === "slave" ? current : ({ ...current, recording: !current.recording, paused: false, recordingStartedAt: current.recording ? null : Date.now(), duration: current.recording ? Math.max(current.duration, 68) : current.duration })),
    addMarker: () => setData((current) => ({ ...current, markers: [...current.markers, { id: makeId(), time: current.recordingStartedAt ? (Date.now() - current.recordingStartedAt) / 1000 : current.playhead, label: `Marker ${current.markers.length + 1}` }] })),
    switchCamera: (camera) => setData((current) => ({ ...current, activeCamera: camera, cuts: [...current.cuts, { id: makeId(), time: current.playhead, camera }] })),
    setEqBand: (index, bandValue) => setData((current) => ({ ...current, eq: current.eq.map((item, itemIndex) => itemIndex === index ? bandValue : item) })),
    addSubtitles: () => setData((current) => ({ ...current, subtitles: [{ id: makeId(), start: 1.2, end: 4.8, text: "Every angle tells part of the story." }, { id: makeId(), start: 5.1, end: 8.9, text: "MULTI-CAM keeps them perfectly in sync." }] })),
    updateSubtitle: (subtitleId, text) => setData((current) => ({ ...current, subtitles: current.subtitles.map((item) => item.id === subtitleId ? { ...item, text } : item) })),
    applyPreset: (preset) => setData((current) => ({ ...current, exportConfig: preset === "cinema" ? { aspect: "21:9", resolution: "4K", fps: "24", videoCodec: "H.265/HEVC", bitrate: 80, audioCodec: "FLAC", sampleRate: "96kHz", audioBitrate: 320 } : preset === "reels" ? { aspect: "9:16", resolution: "1080p", fps: "60", videoCodec: "H.264", bitrate: 20, audioCodec: "AAC", sampleRate: "48kHz", audioBitrate: 256 } : { aspect: "16:9", resolution: "720p", fps: "30", videoCodec: "H.264", bitrate: 5, audioCodec: "AAC", sampleRate: "44.1kHz", audioBitrate: 128 } })),
    resetProject: () => setData((current) => ({ ...current, ...projectDefaults, recording: false, recordingStartedAt: null, exportProgress: 0 })),
  }), [data]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useMulticamStore(): MulticamState;
export function useMulticamStore<T>(selector: (state: MulticamState) => T): T;
export function useMulticamStore<T>(selector?: (state: MulticamState) => T) {
  const store = useContext(StoreContext);
  if (!store) throw new Error("MulticamStoreProvider is missing");
  return selector ? selector(store) : store;
}
