import { bounded } from "./async";

/** Serialize native TextureView updates, including on slow emulators.
 * A permanently lost bridge callback is NOT allowed to block all later
 * cleanup commands. Timeout changes only command waiting, not camera state.
 */
export function createSerializedAsyncActions(deadlineMs = 8000) {
  let chain: Promise<void> = Promise.resolve();
  return (action: () => Promise<void>): Promise<void> => {
    const current = chain.then(() => bounded(
      Promise.resolve().then(action), deadlineMs, "Android direct preview",
    ));
    chain = current.catch(() => undefined);
    return current;
  };
}
