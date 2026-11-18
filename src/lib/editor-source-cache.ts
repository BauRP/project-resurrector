/**
 * Lightweight, stable identity for a recorded/imported clip. The browser
 * creates a fresh Blob object and a fresh blob: URL after every library open,
 * so neither can be used as a cache identity. No video bytes are decoded.
 *
 * Changing the persisted clip under the same id must invalidate the derived
 * duration, waveform and filmstrip. This key is metadata-based, not a
 * cryptographic hash; identical metadata with altered bytes is not detected.
 */
export interface EditorSourceIdentity {
  id: string;
  createdAt: number;
  duration?: number;
  playbackRate?: number;
  camera?: number;
  kind?: string;
  name?: string;
  blob: Blob;
}
export interface EditorCachedAnalysis {
  duration: number;
  peaks: number[];
  sourceKey?: string;
}

export function editorSourceKey(clip: EditorSourceIdentity): string {
  return JSON.stringify([
    clip.id, clip.createdAt, clip.blob.size, clip.blob.type,
    clip.duration ?? null, clip.playbackRate ?? null,
    clip.camera ?? null, clip.kind ?? null, clip.name ?? null,
  ]);
}

/** Keep existing derived data only if it belongs to this exact source key. */
export function readCurrentEditorAnalysis(
  id: string,
  key: string,
  analysis: Map<string, EditorCachedAnalysis>,
  thumbnails: Map<string, string[]>,
): EditorCachedAnalysis | undefined {
  const cached = analysis.get(id);
  if (cached?.sourceKey === key) return cached;
  // Do not pass obsolete video frames or PCM peaks into the new Editor layer.
  analysis.delete(id);
  thumbnails.delete(id);
  return undefined;
}
