import type { StateData, Marker, Cut, Subtitle } from "./multicam-store";

/** Be conservative with corrupt snapshots: preserve validated user entries
 * individually and leave the original storage bytes untouched for recovery.
 * This runs at startup and must never traverse unbounded untrusted objects.
 */
const record = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const short = (v: unknown, max: number): v is string =>
  typeof v === "string" && v.length <= max;
const id = (v: unknown): v is string => short(v, 128) && v.length > 0;
const boundedArray = (v: unknown): unknown[] | null =>
  Array.isArray(v) && v.length <= 3000 ? v : null;

export function sanitizePersistedState(value: unknown): Partial<StateData> {
  const src = record(value);
  if (!src) return {};
  const out: Partial<StateData> = {};
  if (src.theme === "light" || src.theme === "dark") out.theme = src.theme;
  if (short(src.language, 12) && /^[a-zA-Z-]{2,12}$/.test(src.language))
    out.language = src.language;
  if (typeof src.hardwareAcceleration === "boolean")
    out.hardwareAcceleration = src.hardwareAcceleration;
  if (short(src.selectedLut, 128)) out.selectedLut = src.selectedLut;
  if (short(src.teleprompterText, 65536)) out.teleprompterText = src.teleprompterText;
  if (finite(src.teleprompterSpeed, 0, 1000)) out.teleprompterSpeed = src.teleprompterSpeed;
  if (finite(src.teleprompterSize, 8, 256)) out.teleprompterSize = src.teleprompterSize;

  const cfg = record(src.exportConfig);
  if (cfg) {
    const textKeys = ["aspect", "resolution", "fps", "videoCodec", "audioCodec", "sampleRate"] as const;
    const textValid = textKeys.every(key => short(cfg[key], 64));
    if (textValid && finite(cfg.bitrate, 0, 1000) && finite(cfg.audioBitrate, 0, 2000)) {
      out.exportConfig = {
        aspect: cfg.aspect as string, resolution: cfg.resolution as string,
        fps: cfg.fps as string, videoCodec: cfg.videoCodec as string,
        audioCodec: cfg.audioCodec as string, sampleRate: cfg.sampleRate as string,
        bitrate: cfg.bitrate as number, audioBitrate: cfg.audioBitrate as number,
      };
    }
  }
  const markers = boundedArray(src.markers);
  if (markers) out.markers = markers.flatMap((v): Marker[] => {
    const m = record(v);
    return m && id(m.id) && finite(m.time, 0, 86400) && short(m.label, 4096)
      ? [{ id: m.id, time: m.time, label: m.label }] : [];
  });
  const cuts = boundedArray(src.cuts);
  if (cuts) out.cuts = cuts.flatMap((v): Cut[] => {
    const c = record(v);
    return c && id(c.id) && finite(c.time, 0, 86400) &&
      Number.isSafeInteger(c.camera) && finite(c.camera, 0, 256)
      ? [{ id: c.id, time: c.time, camera: c.camera }] : [];
  });
  const subtitles = boundedArray(src.subtitles);
  if (subtitles) out.subtitles = subtitles.flatMap((v): Subtitle[] => {
    const sub = record(v);
    return sub && id(sub.id) && finite(sub.start, 0, 86400) &&
      finite(sub.end, sub.start, 86400) && short(sub.text, 8192)
      ? [{ id: sub.id, start: sub.start, end: sub.end, text: sub.text }] : [];
  });
  return out;
}
