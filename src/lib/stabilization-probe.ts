import { Capacitor, registerPlugin } from "@capacitor/core";

export interface StabilizationProbeResult {
  cameraId: string;
  width: number; height: number; fpsRequested: number;
  source: "camera2-capture-result";
  selected: "eis" | "preview-stabilization" | "ois" | "none";
  state: "capture-result-confirmed" | "not-confirmed" | "unknown" | "declared-unavailable";
  eisDeclared: boolean; previewDeclared: boolean; oisDeclared: boolean;
  framesObserved?: number; confirmations?: number;
  fpsRangeApplied?: boolean; fpsRangeMin?: number; fpsRangeMax?: number;
  captureResultEis?: number | null;
  captureResultOis?: number | null;
  sensorObservation?: {iso?:number;exposureNs?:number;focusDiopters?:number;afState?:number;aeState?:number;awbState?:number;frameDurationNs?:number;sensorIntervals?:number;sensorSpanNs?:number};
  recordedFileVerified: false;
  message: string;
}
interface NativeProbe {
  probe(args: { cameraId: string; width: number; height: number; fps: number }): Promise<StabilizationProbeResult>;
}
const native = registerPlugin<NativeProbe>("StabilizationProbe");
export async function probeStabilization(cameraId: string, width: number, height: number, fps: number): Promise<StabilizationProbeResult> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("StabilizationProbe")) {
    throw new Error("Для проверки CaptureResult требуется Android Camera2");
  }
  return native.probe({ cameraId, width, height, fps });
}
