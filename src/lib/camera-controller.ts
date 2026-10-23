import { bounded } from "./async";

export type FocusSupport = "supported" | "unsupported" | "unknown";
export function focusSupport(caps: Record<string, unknown>): FocusSupport {
  const range = caps['focusDistance'] as { min?: number; max?: number } | undefined;
  const modes = caps['focusMode'] as string[] | undefined;
  if (range && typeof range.max === "number" && range.max > (range.min ?? 0)) return "supported";
  // Manual-focus support is not equivalent to touch-to-focus support.
  // A fixed-focus sensor may still support exposure metering points.
  if (modes && !modes.includes("manual") && !modes.includes("continuous") && !modes.includes("single-shot")) return "unsupported";
  if (range && typeof range.max === "number" && range.max <= (range.min ?? 0)) return "unsupported";
  return "unknown";
}
export function focusPoint(rect: { left: number; top: number; width: number; height: number }, width: number, height: number, clientX: number, clientY: number) {
  const scale = Math.max(rect.width / width, rect.height / height);
  const x = (clientX - rect.left + (width * scale - rect.width) / 2) / (width * scale);
  const y = (clientY - rect.top + (height * scale - rect.height) / 2) / (height * scale);
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}
class CameraController {
  private stream: MediaStream | null = null;
  private owner: symbol | null = null;
  private generation = 0;
  private queues = new Map<MediaStreamTrack, { command: Record<string, unknown> | null; waiters: ((value: boolean) => void)[]; draining: boolean }>();
  async acquire(owner: symbol, constraints: MediaStreamConstraints): Promise<MediaStream> {
    this.release(); this.owner = owner; const generation = this.generation;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera unavailable");
    const stream = await bounded(navigator.mediaDevices.getUserMedia(constraints), 6000, "Camera", (late) => late.getTracks().forEach((t) => t.stop()));
    if (generation !== this.generation || owner !== this.owner) { stream.getTracks().forEach((t) => t.stop()); throw new Error("Camera request superseded"); }
    this.stream = stream; return stream;
  }
  release(owner?: symbol) {
    if (owner && owner !== this.owner) return;
    this.generation++; this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; this.owner = null;
    this.queues.forEach((queue) => { queue.command = null; queue.waiters.splice(0).forEach((resolve) => resolve(false)); });
    this.queues.clear();
  }
  /** Merge rapid slider commands, serialize device calls, never build a backlog. */
  apply(stream: MediaStream | null, constraints: Record<string, unknown>): Promise<boolean> {
    const track = stream?.getVideoTracks()[0];
    if (!track?.applyConstraints || track.readyState === "ended") return Promise.resolve(false);
    const queue = this.queues.get(track) ?? { command: null, waiters: [], draining: false };
    this.queues.set(track, queue);
    queue.command = { ...queue.command, ...constraints };
    const result = new Promise<boolean>((resolve) => queue.waiters.push(resolve));
    if (!queue.draining) void this.drain(track, queue);
    return result;
  }
  private async drain(track: MediaStreamTrack, queue: { command: Record<string, unknown> | null; waiters: ((value: boolean) => void)[]; draining: boolean }) {
    queue.draining = true;
    while (queue.command) {
      await new Promise((resolve) => setTimeout(resolve, 32));
      const command = queue.command; queue.command = null; const waiters = queue.waiters.splice(0);
      let ok = false;
      try { if (command && track.readyState !== "ended") { await bounded(track.applyConstraints({ advanced: [command] } as MediaTrackConstraints), 2500, "Camera setting"); ok = true; } } catch { /* Report rejected device commands to callers. */ }
      waiters.forEach((resolve) => resolve(ok));
    }
    queue.draining = false;
    if (this.queues.get(track) === queue) this.queues.delete(track);
  }
}
export const cameraController = new CameraController();