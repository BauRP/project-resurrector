/** Cancel photo/countdown pauses immediately when Camera is closed.
 * False means the old camera owner must not issue another media command.
 */
export function waitForPhotoDelay(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise(resolve => {
    let done = false;
    const finish = (completed: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      resolve(completed);
    };
    const onAbort = () => finish(false);
    const timer = setTimeout(() => finish(true), Math.max(0, ms));
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) finish(false);
  });
}
