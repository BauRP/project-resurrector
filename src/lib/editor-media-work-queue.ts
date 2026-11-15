/**
 * Serialize optional editor work through one decoder/encoder lane.
 * Queued work that is cancelled while another codec is busy is removed
 * immediately instead of retaining a Promise chain until the codec exits.
 * Running work remains in the lane until its own cleanup finishes; an abort
 * must never allow two hardware decoders to overlap.
 */
export class EditorMediaWorkQueue {
  private active = false;
  private pending: Array<() => void> = [];
  private waiting = 0;

  get queuedCount(): number { return this.waiting; }

  run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
    if (signal?.aborted) return Promise.resolve(undefined);
    return new Promise<T | undefined>((resolve, reject) => {
      let queued = true;
      const start = () => {
        queued = false;
        signal?.removeEventListener("abort", cancelQueued);
        // Schedule expensive codec setup outside the caller's input handler.
        void Promise.resolve().then(() => signal?.aborted ? undefined : work()).then(
          result => { finish(); resolve(result); },
          error => { finish(); reject(error); },
        );
      };
      const cancelQueued = () => {
        if (!queued) return;
        queued = false;
        const index = this.pending.indexOf(start);
        if (index >= 0) this.pending.splice(index, 1);
        signal?.removeEventListener("abort", cancelQueued);
        this.waiting--;
        resolve(undefined);
      };
      const finish = () => {
        this.waiting--;
        this.active = false;
        this.drain();
      };
      this.waiting++;
      this.pending.push(start);
      signal?.addEventListener("abort", cancelQueued, { once: true });
      // Handle an abort between the initial check and listener registration.
      if (signal?.aborted) cancelQueued();
      this.drain();
    });
  }

  private drain(): void {
    if (this.active) return;
    const next = this.pending.shift();
    if (!next) return;
    this.active = true;
    next();
  }
}

// Across Editor mounts: only one optional codec operation at a time.
export const editorMediaWorkQueue = new EditorMediaWorkQueue();
