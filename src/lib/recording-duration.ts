/**
 * Duration evidence from MediaRecorder lifecycle events (monotonic milliseconds).
 * This is wall-clock CAPTURE time minus confirmed pauses, not encoded FPS or a
 * proof that every frame reached the file. A missing lifecycle event is unknown.
 */
export class CaptureDurationClock {
  private began: number | null = null;
  private stopped: number | null = null;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private invalid = false;

  private valid(time: number): boolean {
    return Number.isFinite(time) && time >= 0;
  }

  startedAt(time: number): void {
    if (!this.valid(time) || this.began !== null || this.stopped !== null) {
      this.invalid = true;
      return;
    }
    this.began = time;
  }

  pausedAtTime(time: number): void {
    if (!this.valid(time) || this.began === null || time < this.began ||
        this.stopped !== null || this.pausedAt !== null) {
      this.invalid = true;
      return;
    }
    this.pausedAt = time;
  }

  resumedAt(time: number): void {
    if (!this.valid(time) || this.pausedAt === null || time < this.pausedAt ||
        this.stopped !== null) {
      this.invalid = true;
      return;
    }
    this.pausedTotal += time - this.pausedAt;
    this.pausedAt = null;
  }

  stopRequestedAt(time: number): void {
    if (this.stopped !== null) return;
    if (!this.valid(time) || this.began === null || time < this.began) {
      this.invalid = true;
      return;
    }
    this.stopped = time;
    if (this.pausedAt !== null) {
      if (time < this.pausedAt) this.invalid = true;
      else this.pausedTotal += time - this.pausedAt;
      this.pausedAt = null;
    }
  }

  /** null avoids a false shortened-clip warning when timings are incomplete. */
  durationMs(): number | null {
    if (this.invalid || this.began === null || this.stopped === null) return null;
    const duration = this.stopped - this.began - this.pausedTotal;
    return Number.isFinite(duration) && duration > 0 && duration <= 86400000
      ? duration : null;
  }
}
