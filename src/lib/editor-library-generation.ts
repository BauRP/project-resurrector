/** Guard asynchronous library discovery across Editor unmounts and reloads.
 * A completed IndexedDB request can settle after an AbortController aborts;
 * never publish its Blob URLs or error/loading UI into an abandoned screen.
 */
export function isCurrentEditorLibraryLoad(
  generation: number,
  currentGeneration: number,
  aborted: boolean,
): boolean {
  return !aborted && generation === currentGeneration;
}
