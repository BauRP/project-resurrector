export function bounded<T>(promise: Promise<T>, ms: number, label: string, onLate?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error(`${label}: timeout`)); }, ms);
    promise.then((value) => { if (settled) { onLate?.(value); return; } settled = true; clearTimeout(timer); resolve(value); },
      (error) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); });
  });
}
/** Retry a genuinely failed operation, but never open a fresh media decoder
 * after navigation has aborted the Editor. A completed successful operation
 * remains with the caller, which owns and cleans up its temporary Blob URL.
 */
export async function retry<T>(
  operation: () => Promise<T>,
  attempts = 2,
  signal?: AbortSignal,
): Promise<T> {
  let error: unknown;
  for (let i = 0; i < attempts; i++) {
    if (signal?.aborted) throw new Error("Operation cancelled");
    try {
      return await operation();
    } catch (e) {
      error = e;
      if (signal?.aborted) throw e;
    }
  }
  throw error;
}