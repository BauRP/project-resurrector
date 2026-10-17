import { Capacitor, registerPlugin } from "@capacitor/core";

export interface NativeCameraProfile { cameraId: string; facing: "back" | "front" | "external"; sizes: string[]; fpsRanges: string[]; highSpeed: { size: string; fps: number[] }[]; profiles: string[]; isoRange: [number, number] | null; manualSensor: boolean; toneCurve: boolean; raw?: boolean }
export interface NativeCapabilities { cameras: NativeCameraProfile[]; codecs: string[] }
export interface NativeThermal { status: number; label: string; temperatureC: number | null }
export interface NativeAudioInput { id: string; name: string; type: string }

interface MultiCamNativePlugin {
  getCapabilities(): Promise<NativeCapabilities>;
  getThermalStatus(): Promise<NativeThermal>;
  listAudioInputs(): Promise<{ inputs: NativeAudioInput[] }>;
  setPreferredAudioInput(options: { id: string }): Promise<{ ok: boolean }>;
  startHighSpeedRecording(options: { cameraId: string; width: number; height: number; fps: number }): Promise<{ path: string }>;
  stopHighSpeedRecording(): Promise<{ path: string; durationMs: number }>;
  /** Hybrid AI (ML Kit semantics + YUV physics). Optional on the native side — callers must handle rejection. */
  toggleHybridAI(options: { enabled: boolean }): Promise<{ enabled: boolean; engines: string[] }>;
  setFocusMode(options: { mode: HybridFocusMode }): Promise<{ mode: HybridFocusMode }>;
  setMeteringMode(options: { mode: "matrix" | "center" | "spot" }): Promise<{ mode: string }>;
  getHybridAIStatus(): Promise<HybridAIStatus>;
}
export type HybridFocusMode = "continuous" | "face" | "hybrid_nearest_priority";
export interface HybridAIStatus { enabled: boolean; engines: string[]; detections: { kind: "face" | "hand" | "text" | "food"; x: number; y: number; w: number; h: number; score: number }[]; histogram?: number[]; contrast?: number }

export const MultiCamNative = registerPlugin<MultiCamNativePlugin>("MultiCamNative");
export const isNative = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("MultiCamNative");

const thermalLabels = ["Норма", "Слабый нагрев", "Умеренный нагрев", "Сильный нагрев", "Критично", "Аварийно", "Отключение"];
/** Tries the native hybrid-AI engine; resolves to "native" or "web" (browser FaceDetector / canvas analysis). */
export async function hybridAI(enabled: boolean, mode: HybridFocusMode): Promise<"native" | "web"> {
  if (!isNative()) return "web";
  try { await MultiCamNative.toggleHybridAI({ enabled }); await MultiCamNative.setFocusMode({ mode }); return "native"; } catch { return "web"; }
}
export async function nativeMetering(mode: "matrix" | "center" | "spot") { if (!isNative()) return false; try { await MultiCamNative.setMeteringMode({ mode }); return true; } catch { return false; } }
export const thermalLabel = (status: number) => thermalLabels[status] ?? "Неизвестно";
