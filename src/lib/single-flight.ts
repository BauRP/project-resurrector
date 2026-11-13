/** A JavaScript timeout never means a native Android Binder call ended.
 * Share the actual unsettled promise, then start a fresh call ONLY after
 * the previous one really resolves or rejects.
 */
export function createSingleFlight<T>(perform: () => Promise<T>): () => Promise<T> {
  let active: Promise<T> | null = null;
  return () => {
    if (active) return active;
    const call = Promise.resolve().then(perform);
    active = call;
    void call.then(
      () => { if (active === call) active = null; },
      () => { if (active === call) active = null; },
    );
    return call;
  };
}
