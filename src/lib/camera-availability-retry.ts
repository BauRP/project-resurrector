/** Keep the camera UI responsive when Android/Camera2 is absent or slow.
 * Queries are serialized by awaiting each bounded status response before
 * scheduling the next one. No camera, microphone or permission request is
 * started here. On every failure we back off to avoid waking emulators.
 */
export function startNativeStatusRecovery<T>(
  read: () => Promise<T>,
  onStatus: (status: T) => void,
  onUnavailable: (error: unknown) => void,
  isActive: () => boolean = () => true,
): () => void {
  let cancelled = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const attempt = () => {
    if (cancelled) return;
    if (!isActive()) {
      timer = setTimeout(attempt, 6000);
      return;
    }
    let pending: Promise<T>;
    try { pending = read(); }
    catch (error) { pending = Promise.reject(error); }
    void pending.then(status => {
      if (!cancelled) onStatus(status);
    }, error => {
      if (cancelled) return;
      onUnavailable(error);
      failures++;
      timer = setTimeout(attempt,
        Math.min(30000, 3500 * 2 ** Math.min(failures - 1, 4)));
    });
  };
  attempt();
  return () => {
    cancelled = true;
    if (timer !== null) clearTimeout(timer);
  };
}

/** Automatic retries only for temporary hardware/bridge problems, never
 * permission denial or unsupported/mismatched physical devices. */
export function isRetryableCameraPreviewError(error: unknown): boolean {
  if (!error || typeof error !== "object") return true;
  const name = "name" in error && typeof error.name === "string" ? error.name : "";
  return !["NotAllowedError", "PermissionDeniedError", "SecurityError",
    "OverconstrainedError", "CameraDeviceMismatchError",
    "MicrophoneDeviceMismatchError", "CameraSupersededError"].includes(name);
}

export function previewRetryDelay(failure: number): number | null {
  return [5000, 10000, 20000][failure - 1] ?? null;
}
