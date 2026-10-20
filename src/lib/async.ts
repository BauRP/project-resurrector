export function bounded<T>(promise: Promise<T>, ms: number, label: string, onLate?: (value: T) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => { settled = true; reject(new Error(`${label}: timeout`)); }, ms);
    promise.then((value) => { if (settled) { onLate?.(value); return; } settled = true; clearTimeout(timer); resolve(value); },
      (error) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); });
  });
}
export async function retry<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  let error: unknown;
  for (let i = 0; i < attempts; i++) { try { return await operation(); } catch (e) { error = e; } }
  throw error;
}