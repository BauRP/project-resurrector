import { readPersistedClip } from "./clip-persistence";

/** Bounded random-access replay checks. These are NOT a full-file decode,
 * encoder FPS test, or recording continuity certificate.
 */
export interface VideoCheckpointEvidence {
  status: "sampled" | "unavailable";
  expected: number;
  observed: number;
  message: string;
}

/** Short videos and WebM containers with no duration cannot be reliably
 * seeking-tested. Never invent sample positions from the blob byte size.
 */
export function planVideoCheckpoints(durationSeconds: number | null | undefined): number[] {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds) ||
      durationSeconds < 8 || durationSeconds > 86400) return [];
  return [0.45, 0.85].map(ratio => Math.round(durationSeconds * ratio * 1000) / 1000);
}

export function summarizeVideoCheckpoints(expected: number, observed: number): VideoCheckpointEvidence {
  const ok = Number.isSafeInteger(expected) && expected > 0 &&
    Number.isSafeInteger(observed) && observed === expected;
  return {
    status: ok ? "sampled" : "unavailable",
    expected: Number.isSafeInteger(expected) && expected >= 0 ? expected : 0,
    observed: Number.isSafeInteger(observed) && observed >= 0 ? Math.min(observed, expected) : 0,
    message: ok
      ? "Дополнительные участки сохранённого видео показали декодированные кадры; полная целостность записи и FPS кодека не проверены."
      : "Проверка последующих кадров недоступна или завершилась частично; полная целостность записи не подтверждена.",
  };
}

/** Use actual WebView-decoded presentation frames, not merely successful
 * seeked/metadata events. On older WebViews without requestVideoFrameCallback
 * return unknown; do not count seeked as a decoded frame.
 */
export async function probeVideoBlobCheckpoints(
  blob: Blob, durationSeconds: number | null, maxProbeMs = 6500,
): Promise<VideoCheckpointEvidence> {
  const positions = planVideoCheckpoints(durationSeconds);
  if (!positions.length || typeof document === "undefined" || typeof URL === "undefined")
    return summarizeVideoCheckpoints(positions.length, 0);
  const video = document.createElement("video");
  if (typeof video.requestVideoFrameCallback !== "function")
    return summarizeVideoCheckpoints(positions.length, 0);
  const source = URL.createObjectURL(blob);
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  holder.appendChild(video);
  document.body.appendChild(holder);
  let handle = 0;
  let observed = 0;
  const totalDeadline = performance.now() + Math.max(1500, Math.min(9000, maxProbeMs));
  try {
    video.src = source;
    video.load();
    for (const position of positions) {
      const remaining = totalDeadline - performance.now();
      if (remaining < 250) break;
      const success = await new Promise<boolean>(resolve => {
        let finished = false;
        let timer = 0;
        const finish = (ok: boolean) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (handle) { video.cancelVideoFrameCallback(handle); handle = 0; }
          video.onseeked = null;
          video.onerror = null;
          resolve(ok);
        };
        timer = window.setTimeout(() => finish(false), Math.min(remaining, 3500));
        video.pause();
        video.onseeked = () => {
          if (finished) return;
          try {
            handle = video.requestVideoFrameCallback((_time, frame) => {
              const actual = frame.mediaTime;
              finish(video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 &&
                Number.isFinite(actual) && Math.abs(actual - position) < 2);
            });
            void video.play().catch(() => finish(false));
          } catch { finish(false); }
        };
        video.onerror = () => finish(false);
        try { video.currentTime = position; }
        catch { finish(false); }
      });
      if (!success) break;
      observed++;
    }
  } catch {
    // Some WebViews cannot seek MediaRecorder WebM; do not call this corruption.
  } finally {
    if (handle) video.cancelVideoFrameCallback(handle);
    video.pause();
    video.onseeked = null;
    video.onerror = null;
    video.removeAttribute("src");
    video.load();
    holder.remove();
    URL.revokeObjectURL(source);
  }
  return summarizeVideoCheckpoints(positions.length, observed);
}

export async function probeStoredClipCheckpoints(
  clipId: string, durationSeconds: number | null,
): Promise<VideoCheckpointEvidence> {
  const clip = await readPersistedClip(clipId);
  return probeVideoBlobCheckpoints(clip.blob, durationSeconds);
}
