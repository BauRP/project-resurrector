import { Capacitor, registerPlugin } from "@capacitor/core";

/** Native Camera2 RAW_SENSOR output. No fake RAW conversion from a JPEG or canvas. */
export interface RawDngResult {
  cameraId: string;
  width: number;
  height: number;
  bytes: number;
  path: string;
  format: "image/x-adobe-dng";
}
interface RawDngBridge { captureRaw(options: { cameraId: string }): Promise<RawDngResult> }
const bridge = registerPlugin<RawDngBridge>("RawDng");

export async function captureRealDng(cameraId: string): Promise<RawDngResult> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("RawDng")) {
    throw new Error("Настоящий DNG доступен только на совместимом Android Camera2");
  }
  if (!cameraId) throw new Error("Не указан реальный идентификатор камеры");
  return bridge.captureRaw({ cameraId });
}
