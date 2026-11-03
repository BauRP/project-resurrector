/** A MediaStream track can remain reported as "live" for a few frames
 * after an external USB camera disappears. A devicechange is only evidence
 * of actual removal when enumeration completed, reported trustworthy IDs,
 * and a previously selected/active EXACT device is now missing.
 * Never mistake a fold resize or an empty permission-redacted ID list for
 * a confirmed physical disconnect.
 */
export type CameraPresence = "present" | "missing" | "unknown";

export function verifyCameraPresence(
  expectedId: string,
  currentDevices: readonly Pick<MediaDeviceInfo, "kind" | "deviceId">[],
): CameraPresence {
  if (!expectedId || !Array.isArray(currentDevices)) return "unknown";
  const cameras = currentDevices.filter(d => d?.kind === "videoinput");
  if (cameras.some(d => d.deviceId === expectedId)) return "present";
  if (!cameras.length || !cameras.some(d => typeof d.deviceId === "string" && !!d.deviceId))
    return "unknown";
  return "missing";
}

/** Only exact requested IDs should trigger forced stop. A facingMode-based
 * default camera may transparently change its actual ID; it is handled by
 * track.ended rather than falsely claiming a USB-camera removal.
 */
export function selectedCameraWasRemoved(
  expectedId: string,
  currentDevices: readonly Pick<MediaDeviceInfo, "kind" | "deviceId">[],
): boolean {
  return verifyCameraPresence(expectedId, currentDevices) === "missing";
}

/** Finishing a stale enumerateDevices() after a newer fold/camera selection
 * is forbidden from stopping the newer recorder or disabling preview.
 */
export class CameraHotplugGeneration {
  private serial = 0;
  next(): number { return ++this.serial; }
  isCurrent(token: number): boolean { return token === this.serial; }
  invalidate(): void { this.serial++; }
}

/** Two distinct device inventories are required to stop an active recording.
 * The validity callback also rejects a result after Activity destruction,
 * repeated devicechange or a user selecting another lens.
 */
export async function confirmSelectedCameraRemoved(
  expectedId: string,
  enumerate: () => Promise<readonly Pick<MediaDeviceInfo, "kind" | "deviceId">[]>,
  isCurrent: () => boolean,
  delay: () => Promise<void>,
): Promise<boolean> {
  if (!expectedId || !isCurrent()) return false;
  try {
    const first = await enumerate();
    if (!isCurrent() || verifyCameraPresence(expectedId, first) !== "missing") return false;
    await delay();
    if (!isCurrent()) return false;
    const second = await enumerate();
    return isCurrent() && verifyCameraPresence(expectedId, second) === "missing";
  } catch { return false; }
}
