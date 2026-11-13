import { waitForEditorQuietInput } from "./editor-quiet-input";

/**
 * Protect the foreground Editor from disposable decoder/encoder jobs.
 * A proxy or thumbnail batch starts only after user input settles; if the
 * user interacts or starts playback mid-job, abort just that disposable job,
 * release its MediaCodec resources, and retry once the UI becomes quiet.
 *
 * This never interrupts original video playback, user-initiated export,
 * recording or timeline actions. The same thumbnail count and proxy quality
 * are produced after editing settles. The caller owns the session AbortSignal.
 */
export async function runEditorQuietMediaWork<T>(
  session: AbortSignal,
  isPlaying: () => boolean,
  work: (attempt: AbortSignal) => Promise<T>,
  quietMs = 1500,
): Promise<T | undefined> {
  if (session.aborted) return undefined;
  if (typeof window === "undefined") return work(session);
  const inputEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

  while (!session.aborted) {
    if (!(await waitForEditorQuietInput(session, isPlaying, quietMs))) return undefined;
    const attempt = new AbortController();
    const interrupt = () => attempt.abort();
    // A playback state change can happen without a pointer event, e.g. via
    // restored transport state. Poll only while an optional job is active.
    for (const event of inputEvents) {
      window.addEventListener(event, interrupt, { capture: true, passive: true });
    }
    session.addEventListener("abort", interrupt, { once: true });
    const playbackWatch = window.setInterval(() => {
      if (isPlaying()) interrupt();
    }, 200);
    try {
      if (session.aborted || isPlaying()) {
        interrupt();
      } else {
        const result = await work(attempt.signal);
        if (!attempt.signal.aborted && !session.aborted) return result;
      }
    } catch (error) {
      // A real codec/storage error remains a real error. Only cancellation
      // prompted by interaction/navigation is retried or discarded.
      if (!attempt.signal.aborted && !session.aborted) throw error;
    } finally {
      window.clearInterval(playbackWatch);
      session.removeEventListener("abort", interrupt);
      for (const event of inputEvents) window.removeEventListener(event, interrupt, true);
    }
    // Yield before resubscribing; frequent gestures must not spin a tight loop.
    if (!session.aborted) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }
  return undefined;
}
