/**
 * A single lane for disposable editor media analysis. Android WebView has a
 * limited supply of hardware decoders; waveform decoding, frame seeking and
 * proxy encoding must not all initialize at the same time.
 *
 * Cancellation skips queued operations; active work must independently honour
 * the supplied AbortSignal and free its own media resources.
 */
export class EditorMediaWorkQueue {
  private tail: Promise<void> = Promise.resolve();
  private waiting = 0;

  get queuedCount(): number { return this.waiting; }

  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T | undefined> {
    this.waiting++;
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>(resolve => { release = resolve; });
    try {
      await previous;
      if (signal?.aborted) return undefined;
      return await work();
    } finally {
      this.waiting--;
      release();
    }
  }
}

// Shared across editor mounts: navigating away and back must not launch a new
// decoder while the previous mount is still closing its media resources.
export const editorMediaWorkQueue = new EditorMediaWorkQueue();
