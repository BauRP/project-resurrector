import { Capacitor, registerPlugin } from "@capacitor/core";

export interface StabilizationProbeResult {
  cameraId: string;
  width: number; height: number; fpsRequested: number;
  source: "camera2-capture-result";
  selected: "eis" | "preview-stabilization" | "ois" | "none";
  state: "capture-result-confirmed" | "not-confirmed" | "unknown" | "declared-unavailable";
  eisDeclared: boolean; previewDeclared: boolean; oisDeclared: boolean;
  framesObserved?: number; confirmations?: number;
  captureResultEis?: number | null;
  captureResultOis?: number | null;
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
