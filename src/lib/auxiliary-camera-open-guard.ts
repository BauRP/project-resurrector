import { bounded } from "./async";

/**
 * getUserMedia cannot be cancelled in WebView. A JavaScript timeout must NOT
 * release the camera-opening lease: Android OEM camera drivers can remain in
 * the original openCamera() call. Keep a single outstanding auxiliary open
 * until the browser REALLY settles it, and close late streams immediately.
 *
 * This gate is for the second-camera PiP and two-camera verification paths.
 * The regular camera already has its own owner-aware single-flight controller.
 */
let activeAuxiliaryOpen: Promise<MediaStream> | null = null;

function stopStream(stream: MediaStream) {
  try { stream.getTracks().forEach(track => track.stop()); }
  catch { /* The camera could already have been destroyed by Android. */ }
}

export function hasPendingAuxiliaryCameraOpen(): boolean {
  return activeAuxiliaryOpen !== null;
}

export async function openAuxiliaryCamera(
  constraints: MediaStreamConstraints,
  timeoutMs: number,
  operation: string,
): Promise<MediaStream> {
  if (activeAuxiliaryOpen) {
    throw new Error("Предыдущий запрос дополнительной камеры всё ещё выполняется");
  }
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("WebView камера недоступна");
  const pending = Promise.resolve().then(() => navigator.mediaDevices.getUserMedia(constraints));
  activeAuxiliaryOpen = pending;
  // Keep this lease past bounded() timeout. The late stream is disposed by
  // bounded's callback and a new getUserMedia may start only after settlement.
  void pending.then(
    () => { if (activeAuxiliaryOpen === pending) activeAuxiliaryOpen = null; },
    () => { if (activeAuxiliaryOpen === pending) activeAuxiliaryOpen = null; },
  );
  return bounded(pending, timeoutMs, operation, stopStream);
}
