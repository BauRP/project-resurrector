/**
 * WebView decodeAudioData requires the entire compressed file AND expanded
 * PCM to coexist in memory. Even a small MP3 can expand to hundreds of MB.
 * These are memory-safety gates, not statements about codec compatibility.
 */
export const MiB = 1024 * 1024;
export function waveformDecodeBudget(deviceGiB?: number): number {
  // Use conservative defaults for older Android WebViews without deviceMemory.
  const memory = Number.isFinite(deviceGiB) && (deviceGiB ?? 0) > 0
    ? Math.min(8, Math.max(0.5, deviceGiB!)) : 1;
  return Math.min(128 * MiB, Math.max(32 * MiB, Math.floor(memory * 40 * MiB)));
}
export function canDecodeWaveformInMemory(
  compressedBytes: number, seconds: number, deviceGiB?: number,
): boolean {
  if (!Number.isFinite(compressedBytes) || compressedBytes <= 0 ||
      !Number.isFinite(seconds) || seconds <= 0) return false;
  const budget = waveformDecodeBudget(deviceGiB);
  // This bounds *both* the full-file FileReader allocation and a conservative
  // 48 kHz stereo Float32 PCM decode with headroom for WebView + UI surfaces.
  return compressedBytes <= Math.min(32 * MiB, budget / 3) &&
    seconds * 48000 * 2 * 4 <= budget / 2;
}
