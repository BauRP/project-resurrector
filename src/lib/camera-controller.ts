import { bounded } from "./async";

/** A diagnostic check must never evict the user's active camera. */
export class CameraBusyError extends Error {
  constructor() { super("Камера занята активным предпросмотром или видеозаписью"); this.name = "CameraBusyError"; }
}
export class CameraSupersededError extends Error {
  constructor() { super("Запрос камеры отменён более новым запросом"); this.name = "CameraSupersededError"; }
}
type ConstraintQueue = {
  command: Record<string, unknown> | null;
  waiters: ((value: boolean) => void)[];
  inFlightWaiters: ((value: boolean) => void)[];
  draining: boolean;
  cancelled: boolean;
};

export type FocusSupport = "supported" | "unsupported" | "unknown";
export function focusSupport(caps: Record<string, unknown>): FocusSupport {
  const range = caps['focusDistance'] as { min?: number; max?: number } | undefined;
  const modes = caps['focusMode'] as string[] | undefined;
  if (range && typeof range.max === "number" && range.max > (range.min ?? 0)) return "supported";
  // Reports manual-focus ability. Touch-to-focus is checked independently by CameraTab.
  // A fixed-focus sensor may still support exposure metering points.
  if (modes && !modes.includes("manual")) return "unsupported";
  if (range && typeof range.max === "number" && range.max <= (range.min ?? 0)) return "unsupported";
  return "unknown";
}
export function focusPoint(rect: { left: number; top: number; width: number; height: number }, width: number, height: number, clientX: number, clientY: number) {
  if (![rect.left, rect.top, rect.width, rect.height, width, height, clientX, clientY].every(Number.isFinite) ||
      rect.width <= 0 || rect.height <= 0 || width <= 0 || height <= 0) return { x: 0.5, y: 0.5 };
  const scale = Math.max(rect.width / width, rect.height / height);
  const x = (clientX - rect.left + (width * scale - rect.width) / 2) / (width * scale);
  const y = (clientY - rect.top + (height * scale - rect.height) / 2) / (height * scale);
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}
class CameraController {
  private stream: MediaStream | null = null;
  private owner: symbol | null = null;
  private generation = 0;
  private queues = new Map<MediaStreamTrack, ConstraintQueue>();
  async acquire(owner: symbol, constraints: MediaStreamConstraints, options: { preempt?: boolean } = {}): Promise<MediaStream> {
    // User acquisition may supersede a diagnostic, but never the reverse.
    if (options.preempt === false && this.owner !== null && this.owner !== owner) throw new CameraBusyError();
    this.release(); this.owner = owner; const generation = this.generation;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
      const stream = await bounded(navigator.mediaDevices.getUserMedia(constraints), 6000, "Camera",
        (late) => late.getTracks().forEach(t => t.stop()));
      if (generation !== this.generation || owner !== this.owner) {
        stream.getTracks().forEach(t => t.stop());
        throw new CameraSupersededError();
      }
      this.stream = stream;
      return stream;
    } catch (error) {
      // Failed opens must not retain a stale lease or evict newer requests.
      if (generation === this.generation && owner === this.owner) this.release(owner);
      throw error;
    }
  }
  release(owner?: symbol) {
    if (owner && owner !== this.owner) return;
    this.generation++; this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; this.owner = null;
    this.queues.forEach(queue => {
      queue.cancelled = true;
      queue.command = null;
      queue.waiters.splice(0).forEach(resolve => resolve(false));
      queue.inFlightWaiters.splice(0).forEach(resolve => resolve(false));
    });
    this.queues.clear();
  }
  /** Merge rapid slider commands, serialize device calls, never build a backlog. */
  apply(stream: MediaStream | null, constraints: Record<string, unknown>): Promise<boolean> {
    const track = stream?.getVideoTracks()[0];
    if (!track?.applyConstraints || track.readyState !== "live") return Promise.resolve(false);
    // A stale stream must not be reconfigured after a newer primary capture
    // acquired the controller. Secondary dual-camera tracks remain independent.
    if (this.owner !== null && stream !== this.stream && this.stream?.getVideoTracks()[0] === track)
      return Promise.resolve(false);
    const queue = this.queues.get(track) ?? {
      command: null, waiters: [], inFlightWaiters: [], draining: false, cancelled: false,
    };
    this.queues.set(track, queue);
    queue.command = { ...queue.command, ...constraints };
    const result = new Promise<boolean>((resolve) => queue.waiters.push(resolve));
    if (!queue.draining) void this.drain(track, queue);
    return result;
  }
  private async drain(track: MediaStreamTrack, queue: ConstraintQueue) {
    queue.draining = true;
    try {
      while (queue.command && !queue.cancelled) {
        await new Promise(resolve => setTimeout(resolve, 32));
        if (queue.cancelled) break;
        const command = queue.command;
        queue.command = null;
        const waiters = queue.waiters.splice(0);
        queue.inFlightWaiters = waiters;
        let ok = false;
        try {
          if (command && track.readyState === "live") {
            await bounded(track.applyConstraints({ advanced: [command] } as MediaTrackConstraints), 2500, "Camera setting");
            ok = !queue.cancelled && track.readyState === "live";
          }
        } catch { /* Rejected/expired device commands cannot be confirmed. */ }
        queue.inFlightWaiters = [];
        waiters.forEach(resolve => resolve(ok));
      }
    } finally {
      queue.waiters.splice(0).forEach(resolve => resolve(false));
      queue.inFlightWaiters.splice(0).forEach(resolve => resolve(false));
      queue.draining = false;
      if (this.queues.get(track) === queue) this.queues.delete(track);
    }
  }
}
export const cameraController = new CameraController();