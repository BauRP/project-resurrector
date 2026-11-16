/** A proxy Object URL belongs to one original media URL and clip id.
 * Different clips must never share a disposable preview, and a clip removed
 * from the timeline must release the old Blob URL without waiting for Editor
 * unmount. Original video/object URLs are managed separately by the library.
 */
export interface EditorProxyHandle {
  sourceUrl: string;
  proxyUrl: string;
}

/** Compute which disposable proxy URLs no longer correspond to the timeline. */
export function staleEditorProxyIds(
  existing: ReadonlyMap<string, EditorProxyHandle>,
  visibleSources: ReadonlyMap<string, string>,
): string[] {
  const stale: string[] = [];
  for (const [id, entry] of existing) {
    if (visibleSources.get(id) !== entry.sourceUrl) stale.push(id);
  }
  return stale;
}
