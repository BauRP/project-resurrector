import { restoreViewState, saveViewState } from "./fold-ui-recovery";
import { scheduleAfterPaintTask } from "./after-paint-task";
import { diagnosticCaptureGate } from "./diagnostic-capture-gate";
import { sanitizePersistedState } from "./sanitize-persisted-state";
import { createLatestProjectWriter, readAsyncProjectSnapshot, writeAsyncProjectSnapshot, type SavedProjectSnapshot } from "./async-project-persistence";
import { Capacitor } from "@capacitor/core";
import type React from "react";
import { useSyncExternalStoreWithSelector } from "use-sync-external-store/shim/with-selector";
import type { CapabilityMatrix, Facing } from "./capabilities";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

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
export type AppTheme = "light" | "dark";
export interface StateData {
  tab: AppTab; role: Role; sessionCode: string; recording: boolean; recordingStartedAt: number | null; recordingPhase: "idle" | "starting" | "recording" | "stopping" | "saving" | "saved" | "error"; captureSaveError: string; theme: AppTheme;
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
  captureKind: "photo" | "video"; rawCameraId: string; aiEnabled: boolean; eyeAF: boolean; focusModeAI: FocusModeAI; meterMode: MeterMode; falseColor: boolean; audioUi: boolean; audioGain: number; audioCeiling: number;
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
// Hydrate small appearance preferences before React's first paint. Do not
// parse large editor project blobs in the synchronous render path.
const UI_PREFS_KEY = "multicam-pov-ui-prefs-native";
function readImmediateAppearance(): Partial<StateData> {
  try {
    if (typeof window === "undefined") return {};
    const raw = window.localStorage.getItem(UI_PREFS_KEY);
    if (!raw || raw.length > 2048) return {};
    const prefs = JSON.parse(raw) as Partial<StateData>;
    const patch: Partial<StateData> = {};
    if (prefs.theme === "light" || prefs.theme === "dark") patch.theme = prefs.theme;
    if (typeof prefs.language === "string" && prefs.language.length <= 12) patch.language = prefs.language;
    if (typeof prefs.hardwareAcceleration === "boolean") patch.hardwareAcceleration = prefs.hardwareAcceleration;
    return patch;
  } catch { return {}; }
}
const defaults: StateData = {
  tab: "camera", role: "solo", sessionCode: "POV-842", recording: false, recordingStartedAt: null, recordingPhase: "idle", captureSaveError: "", theme: "light", ...projectDefaults,
  focusPeaking: false, zebras: false, wbLock: false, isoLock: false, grid: "thirds", shutter: "1/48", anamorphic: "off", distortion: 0, dualCamera: false, tracking: true,
  teleprompter: false, teleprompterText: "Welcome to MULTI-CAM POV. Keep your eyes on the lens and tell the story.", teleprompterSpeed: 35, teleprompterSize: 24, touchLocked: false,
  selectedLut: "Neutral", customLutName: "", transition: "Dissolve", chromaEnabled: false, chromaColor: "#36d462", chromaTolerance: 35, chromaSmoothness: 20,
  eq: Array(10).fill(0) as number[], deEsser: false, noiseReduction: 20, autoGain: true, aspect: "16:9", editMode: "Cut", speed: 1, scale: 100, posX: 0, posY: 0, opacity: 100,
  language: "ru", hardwareAcceleration: true, cacheMB: 0, diagnostics: { latency: 0, bandwidth: 0, online: true }, exportOpen: false, mediaOpen: false, exportProgress: 0,
  capture: { resolution: "1080p", fps: 30, codec: "VP9", mode: "normal", profile: "standard", micId: "", iso: null, focus: null, exposure: null }, paused: false, wbKelvin: null, cleanFrame: false, capMatrix: null, facing: "rear", exportMix: { excludedAudio: [], hiddenVideo: [] },
  captureKind: "video", rawCameraId: "", aiEnabled: false, eyeAF: false, focusModeAI: "continuous", meterMode: "matrix", falseColor: false, audioUi: false, audioGain: 1, audioCeiling: -15,
  tint: 0, tuneContrast: 0, tuneShadows: 0, tuneSaturation: 0, shoot: { timer: 0, burst: false, bracket: false, interval: 0, raw: false, night: false, longExp: false }, zoom: 1, lensDeviceId: "",
  exportConfig: { aspect: "16:9", resolution: "4K", fps: "24", videoCodec: "H.264", bitrate: 48, audioCodec: "AAC", sampleRate: "48kHz", audioBitrate: 256 },
};
type StoreApi = { getSnapshot: () => MulticamState; subscribe: (fn: () => void) => () => void };
export function patchState(current: StateData, patch: Partial<StateData>): StateData {
  return Object.entries(patch).every(([key, value]) => Object.is(current[key as keyof StateData], value)) ? current : { ...current, ...patch };
}
export function createMulticamStore(): StoreApi {
  let data: StateData = { ...defaults, ...readImmediateAppearance() };
  const listeners = new Set<() => void>();
  const setData = (update: (current: StateData) => StateData) => {
    const next = update(data);
    if (Object.is(next, data) || Object.keys(next).every((k) => Object.is(next[k as keyof StateData], data[k as keyof StateData]))) return;
    data = next; snapshot = { ...data, ...actions }; listeners.forEach((fn) => fn());
  };
  const actions: Omit<MulticamState, keyof StateData> = {
    set: (patch) => setData((current) => patchState(current, patch)),
    setTab: (tab) => setData((current) => patchState(current, { tab })),
    startSession: (role) => setData((current) => ({ ...current, role, sessionCode: `POV-${Math.floor(100 + Math.random() * 900)}` })),
    toggleRecording: () => setData((current) => (current.role === "slave" || (!current.recording && diagnosticCaptureGate.activeOperation() !== null) || current.recordingPhase === "starting" || current.recordingPhase === "stopping" || current.recordingPhase === "saving") ? current : ({ ...current, recording: !current.recording, paused: false, recordingPhase: current.recording ? "stopping" : "starting", captureSaveError: "", recordingStartedAt: null, duration: current.recording ? Math.max(current.duration, 68) : current.duration })),
    addMarker: () => setData((current) => ({ ...current, markers: [...current.markers, { id: makeId(), time: current.recordingStartedAt ? (Date.now() - current.recordingStartedAt) / 1000 : current.playhead, label: `Marker ${current.markers.length + 1}` }] })),
    switchCamera: (camera) => setData((current) => ({ ...current, activeCamera: camera, cuts: [...current.cuts, { id: makeId(), time: current.playhead, camera }] })),
    setEqBand: (index, bandValue) => setData((current) => ({ ...current, eq: current.eq.map((item, itemIndex) => itemIndex === index ? bandValue : item) })),
    addSubtitles: () => setData((current) => ({ ...current, subtitles: [{ id: makeId(), start: 1.2, end: 4.8, text: "Every angle tells part of the story." }, { id: makeId(), start: 5.1, end: 8.9, text: "MULTI-CAM keeps them perfectly in sync." }] })),
    updateSubtitle: (subtitleId, text) => setData((current) => ({ ...current, subtitles: current.subtitles.map((item) => item.id === subtitleId ? { ...item, text } : item) })),
    applyPreset: (preset) => setData((current) => ({ ...current, exportConfig: preset === "cinema" ? { aspect: "21:9", resolution: "4K", fps: "24", videoCodec: "H.265/HEVC", bitrate: 80, audioCodec: "FLAC", sampleRate: "96kHz", audioBitrate: 320 } : preset === "reels" ? { aspect: "9:16", resolution: "1080p", fps: "60", videoCodec: "H.264", bitrate: 20, audioCodec: "AAC", sampleRate: "48kHz", audioBitrate: 256 } : { aspect: "16:9", resolution: "720p", fps: "30", videoCodec: "H.264", bitrate: 5, audioCodec: "AAC", sampleRate: "44.1kHz", audioBitrate: 128 } })),
    resetProject: () => setData((current) => ({ ...current, ...projectDefaults, recording: false, recordingStartedAt: null, exportProgress: 0 })),
  };
  let snapshot: MulticamState = { ...data, ...actions };
  return { getSnapshot: () => snapshot, subscribe: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; } };
}
const g = globalThis as { __multicamStoreApiCtx?: React.Context<StoreApi | null> };
const StoreContext = g.__multicamStoreApiCtx ??= createContext<StoreApi | null>(null);
/** Only whitelisted, non-capture view state is written on restoration. */
function viewSnapshot(state: MulticamState) {
  return { tab: state.tab, playhead: state.playhead, editMode: state.editMode,
    aspect: state.aspect, captureKind: state.captureKind };
}
const persistedKeys = ["language", "hardwareAcceleration", "selectedLut", "exportConfig", "markers", "cuts", "subtitles", "teleprompterText", "teleprompterSpeed", "teleprompterSize", "theme"] as const;
// Lightweight settings have their own storage: changing the theme must not
// synchronously stringify an arbitrarily large editor project on the UI thread.
const projectPersistedKeys = ["selectedLut", "exportConfig", "markers", "cuts", "subtitles", "teleprompterText", "teleprompterSpeed", "teleprompterSize"] as const;

export function MulticamStoreProvider({ children }: { children: ReactNode }) {
  const ref = useRef<StoreApi | null>(null);
  if (!ref.current) ref.current = createMulticamStore();
  const store = ref.current;
  useEffect(() => {
    let patch: Partial<StateData> = {};
    let lastLegacySavedAt = 0;
    const nativeAsyncProject = Capacitor.isNativePlatform() && typeof indexedDB !== "undefined";
    try {
      const raw = window.localStorage.getItem("multicam-pov-state-native");
      // Do not parse an oversized legacy snapshot on the UI thread.
      // Skip damaged state without deleting the original saved bytes.
      const saved: unknown = raw && raw.length <= 262144 ? JSON.parse(raw) : {};
      patch = sanitizePersistedState(saved);
      if (saved && typeof saved === "object" && !Array.isArray(saved)) {
        const stamp = (saved as Record<string,unknown>)["__savedAt"];
        if (typeof stamp === "number" && Number.isSafeInteger(stamp) && stamp > 0)
          lastLegacySavedAt = stamp;
      }
    } catch { /* Restricted/corrupt main preferences do not block view recovery. */ }
    // New lightweight prefs override the legacy copy if both exist.
    try {
      const raw = window.localStorage.getItem(UI_PREFS_KEY);
      // A legacy write can corrupt the small preferences key too. Use the
      // same size/type checks as readImmediateAppearance() on every read.
      const prefs: unknown = raw && raw.length <= 2048 ? JSON.parse(raw) : {};
      const checked = sanitizePersistedState(prefs);
      if (checked.theme !== undefined) patch.theme = checked.theme;
      if (checked.language !== undefined) patch.language = checked.language;
      if (checked.hardwareAcceleration !== undefined) patch.hardwareAcceleration = checked.hardwareAcceleration;
    } catch { /* A corrupt preference entry must never stop the UI. */ }
    const restoredView = restoreViewState();
    // On Activity recreation a previously frozen Settings screen must not
    // reopen by itself. Keep all editor/project data but start in Camera.
    let cancelStartupViewRepair: (() => void) | null = null;
    if (restoredView.tab === "settings") {
      restoredView.tab = "camera";
      // Do not synchronously write LevelDB during first Activity mount.
      // Keep the corrected view state in memory and durably save after paint.
      const correctedView = { ...restoredView };
      cancelStartupViewRepair = scheduleAfterPaintTask(() => saveViewState(correctedView), 5000);
    }
    store.getSnapshot().set({ ...patch, ...restoredView });
    let previous = persistedKeys.map((k) => store.getSnapshot()[k]);
    let previousView = [store.getSnapshot().tab, store.getSnapshot().playhead,
      store.getSnapshot().editMode, store.getSnapshot().aspect, store.getSnapshot().captureKind];
    let pendingView: ReturnType<typeof viewSnapshot> | null = null;
    let cancelViewPaint: (() => void) | null = null;
    const flushView = () => {
      cancelViewPaint?.();
      cancelViewPaint = null;
      if (pendingView) saveViewState(pendingView);
      pendingView = null;
    };
    const scheduleView = () => {
      // A tab click must not flush localStorage 100ms later while the native
      // GPU compositor is still retiring Camera/Editor surfaces. The exact
      // latest state is in memory until a paint boundary or pagehide.
      cancelViewPaint?.();
      cancelViewPaint = scheduleAfterPaintTask(flushView, 5000);
    };
    // Delay full editor snapshots, not tiny appearance preferences. Repeated
    // timeline edits must not JSON.stringify a large project on every tap.
    // pagehide/visibilitychange/cleanup still synchronously flush the latest
    // state to avoid losing edits when Android destroys the Activity.
    let projectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelProjectPaint: (() => void) | null = null;
    let projectDirty = false;
    let lastSnapshotStamp = Math.max(Date.now() - 1, lastLegacySavedAt);
    let restoreFromAsync = false;
    let mounted = true;
    const modifiedProjectKeys = new Set<string>();
    const writeLegacySnapshot = (value: SavedProjectSnapshot) => {
      try {
        const raw = JSON.stringify({ ...value.state, __savedAt: value.savedAt });
        if (raw.length <= 262144)
          window.localStorage.setItem("multicam-pov-state-native", raw);
      } catch { /* Keep old localStorage contents, never delete user data. */ }
    };
    const asyncWriter = createLatestProjectWriter<SavedProjectSnapshot>(async value => {
      try { await writeAsyncProjectSnapshot(value); }
      catch {
        // Private-mode/older WebView fallback. This only runs after the
        // browser could not commit the asynchronous transaction.
        await new Promise<void>(resolve => {
          scheduleAfterPaintTask(resolve, 2000);
        });
        writeLegacySnapshot(value);
      }
    });
    const flushProject = (urgent = false) => {
      if (projectTimer !== null) clearTimeout(projectTimer);
      projectTimer = null;
      cancelProjectPaint?.();
      cancelProjectPaint = null;
      if (!projectDirty && !(urgent && nativeAsyncProject)) return;
      projectDirty = false;
      const latest = store.getSnapshot();
      const state = Object.fromEntries(persistedKeys.map(k => [k, latest[k]]));
      // A last-wins async queue does not block navigation to Camera/Settings.
      // pagehide still writes a legacy emergency copy for interrupted IDB.
      const value = { savedAt: ++lastSnapshotStamp, state };
      if (nativeAsyncProject && !urgent) asyncWriter.enqueue(value);
      else writeLegacySnapshot(value);
    };
    const scheduleProject = () => {
      projectDirty = true;
      if (projectTimer !== null) clearTimeout(projectTimer);
      cancelProjectPaint?.();
      cancelProjectPaint = null;
      projectTimer = setTimeout(() => {
        projectTimer = null;
        cancelProjectPaint = scheduleAfterPaintTask(flushProject, 5000);
      }, 320);
    };
    // WebView localStorage.setItem is synchronous. Never perform that disk
    // access inside the theme/language switch callback: coalesce repeated
    // switches, and synchronously flush only at lifecycle boundaries.
    let prefsTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelPrefsPaint: (() => void) | null = null;
    let prefsDirty = false;
    const flushPrefs = () => {
      if (prefsTimer !== null) clearTimeout(prefsTimer);
      prefsTimer = null;
      cancelPrefsPaint?.();
      cancelPrefsPaint = null;
      if (!prefsDirty) return;
      prefsDirty = false;
      const latest = store.getSnapshot();
      try {
        window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify({
          theme: latest.theme, language: latest.language,
          hardwareAcceleration: latest.hardwareAcceleration,
        }));
      } catch { /* Keep latest appearance in memory. */ }
    };
    const schedulePrefs = () => {
      prefsDirty = true;
      if (prefsTimer !== null) clearTimeout(prefsTimer);
      cancelPrefsPaint?.();
      cancelPrefsPaint = null;
      prefsTimer = setTimeout(() => {
        prefsTimer = null;
        cancelPrefsPaint = scheduleAfterPaintTask(flushPrefs, 5000);
      }, 80);
    };
    const repairOrFlushView = () => {
      if (cancelStartupViewRepair) {
        cancelStartupViewRepair();
        cancelStartupViewRepair = null;
        // A previous frozen Settings tab must not be written back on exit.
        // If no new navigation is pending, persist the corrected Camera state.
        if (!pendingView) pendingView = viewSnapshot(store.getSnapshot());
      }
      flushView();
    };
    const onVisibility = () => { if (document.hidden) { repairOrFlushView(); flushProject(true); flushPrefs(); } };
    const onPageHide = () => { repairOrFlushView(); flushProject(true); flushPrefs(); };
    // Activity destruction may dispatch pagehide without visibilitychange.
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);
    const unsubscribe = store.subscribe(() => {
      const state = store.getSnapshot(); const values = persistedKeys.map((k) => state[k]);
      const view = [state.tab, state.playhead, state.editMode, state.aspect, state.captureKind];
      if (!view.every((value, index) => Object.is(value, previousView[index]))) {
        const tabChanged = view[0] !== previousView[0];
        // Latest user intent always beats an old startup repair. Otherwise a
        // delayed Camera recovery write could overwrite an Editor navigation.
        cancelStartupViewRepair?.();
        cancelStartupViewRepair = null;
        previousView = view;
        pendingView = viewSnapshot(state);
        // Never perform synchronous Android WebView storage I/O inside a tab
        // button's click handler. A stalled LevelDB flush previously delayed
        // the first Settings frame even though there was no camera recording.
        // The latest navigation state remains pending and pagehide/visibility
        // still flush it for Activity recreation; no project/media is lost.
        if (tabChanged || cancelViewPaint === null) scheduleView();
      }
      const changedKeys = persistedKeys.filter((key, index) => !Object.is(values[index], previous[index]));
      if (restoreFromAsync) {
        previous = values;
        return;
      }
      if (changedKeys.length === 0) return;
      changedKeys.forEach(key => {
        if ((projectPersistedKeys as readonly string[]).includes(key))
          modifiedProjectKeys.add(key);
      });
      previous = values;
      // The preference snapshot is tiny, but even small localStorage writes
      // can stall the JavaScript thread on a busy Android WebView database.
      if (changedKeys.some(key => key === "theme" || key === "language" || key === "hardwareAcceleration")) {
        schedulePrefs();
      }
      if (changedKeys.some(key => (projectPersistedKeys as readonly string[]).includes(key))) {
        scheduleProject();
      }
    });
    // Read only after the initial Android UI paint. A late IndexedDB read
    // may not override project fields the user has already edited.
    const cancelAsyncRestore = nativeAsyncProject ? scheduleAfterPaintTask(() => {
      void readAsyncProjectSnapshot().then(snapshot => {
        if (!mounted || !snapshot || snapshot.savedAt <= lastLegacySavedAt) return;
        const validated = sanitizePersistedState(snapshot.state);
        const projectPatch = Object.fromEntries(projectPersistedKeys.filter(
          key => !modifiedProjectKeys.has(key) && key in validated
        ).map(key => [key, validated[key]])) as Partial<StateData>;
        if (Object.keys(projectPatch).length === 0) return;
        restoreFromAsync = true;
        try { store.getSnapshot().set(projectPatch); }
        finally {
          previous = persistedKeys.map(k => store.getSnapshot()[k]);
          restoreFromAsync = false;
        }
      }).catch(() => { /* Legacy snapshot still restored above. */ });
    }, 1800) : null;
    return () => {
      mounted = false;
      cancelAsyncRestore?.();
      cancelStartupViewRepair?.();
      unsubscribe();
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      repairOrFlushView();
      flushProject(true);
      flushPrefs();
      asyncWriter.close();
    };
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
/** Read the freshest store state during network callbacks without React subscribing
 * the entire app tree to every camera/editor state mutation. */
export function useMulticamGetSnapshot(): () => MulticamState {
  const store = useContext(StoreContext);
  if (!store) throw new Error("MulticamStoreProvider is missing");
  return store.getSnapshot;
}
const identity = (state: MulticamState) => state;
export function useMulticamStore(): MulticamState;
export function useMulticamStore<T>(selector: (state: MulticamState) => T): T;
export function useMulticamStore<T>(selector?: (state: MulticamState) => T) {
  const store = useContext(StoreContext);
  if (!store) throw new Error("MulticamStoreProvider is missing");
  return useSyncExternalStoreWithSelector(store.subscribe, store.getSnapshot, store.getSnapshot, selector ?? identity as (s: MulticamState) => T, Object.is);
}
const cameraExcluded = new Set(["markers", "cuts", "subtitles", "playhead", "duration", "playing", "exportMix", "exportOpen", "mediaOpen", "exportProgress", "exportConfig", "eq", "deEsser", "noiseReduction", "autoGain", "diagnostics", "cacheMB"]);
const settingsKeys: (keyof MulticamState)[] = ["language", "theme", "hardwareAcceleration", "cacheMB", "diagnostics", "sessionCode", "set", "resetProject"];
function useDomainStore(equal: (a: MulticamState, b: MulticamState) => boolean) {
  const store = useContext(StoreContext);
  if (!store) throw new Error("MulticamStoreProvider is missing");
  return useSyncExternalStoreWithSelector(store.subscribe, store.getSnapshot, store.getSnapshot, identity, equal);
}
const cameraEqual = (a: MulticamState, b: MulticamState) => Object.keys(a).every((k) => cameraExcluded.has(k) || Object.is(a[k as keyof MulticamState], b[k as keyof MulticamState]));
const settingsEqual = (a: MulticamState, b: MulticamState) => settingsKeys.every((k) => Object.is(a[k], b[k]));
export const useCameraStore = () => useDomainStore(cameraEqual);
export const useSettingsStore = () => useDomainStore(settingsEqual);

/** Narrow project-only subscriptions imported from Lovable's original work.
 * Camera preview FPS, ISO and thermal readings must not force export panels
 * to re-render; keep actions stable and preserve all state fields. */
const projectExcluded = new Set(["capture", "facing", "capMatrix", "zoom", "lensDeviceId",
  "wbKelvin", "audioGain", "audioCeiling", "audioUi", "aiEnabled", "eyeAF",
  "focusModeAI", "meterMode", "falseColor", "tint", "tuneContrast",
  "tuneShadows", "tuneSaturation", "shoot", "diagnostics", "cacheMB"]);
const projectEqual = (a: MulticamState, b: MulticamState) => Object.keys(a).every(
  key => projectExcluded.has(key) || Object.is(a[key as keyof MulticamState], b[key as keyof MulticamState]));
export const useProjectStore = () => useDomainStore(projectEqual);
