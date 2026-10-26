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
/** A decoded presentation timestamp must match the segment actually sought.
 * `seeked` or readystatechange alone are not proof of a decoded frame.
 */
export function checkpointFrameMatches(actualSeconds: number, targetSeconds: number,
  readyState: number, width: number, height: number): boolean {
  return Number.isFinite(actualSeconds) && Number.isFinite(targetSeconds) &&
    Math.abs(actualSeconds - targetSeconds) <= 1 &&
    readyState >= 2 && Number.isFinite(width) && Number.isFinite(height) &&
    width > 0 && height > 0;
}

/** The metadata/seek lifecycle is intentionally bounded. MediaRecorder WebM
 * can have unknown duration or unsupported seeks; neither implies corruption.
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
  let source: string | null = null;
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  holder.appendChild(video);
  let handle = 0;
  let observed = 0;
  const deadline = performance.now() + Math.max(1500, Math.min(9000, maxProbeMs));
  try {
    if (!document.body) return summarizeVideoCheckpoints(positions.length, 0);
    document.body.appendChild(holder);
    source = URL.createObjectURL(blob);
    // Wait for metadata BEFORE seeking. Seeking immediately after assigning
    // src silently fails on some Android WebView/Chromium versions.
    const metadataReady = await new Promise<boolean>(resolve => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const complete = (ok: boolean) => {
        if (done) return;
        done = true;
        if (timer !== undefined) clearTimeout(timer);
        video.onloadedmetadata = null;
        video.onerror = null;
        resolve(ok);
      };
      video.onloadedmetadata = () => complete(video.readyState >= 1 &&
        Number.isFinite(video.duration) && video.duration >= 8);
      video.onerror = () => complete(false);
      timer = setTimeout(() => complete(false), Math.max(250, Math.min(2200, deadline - performance.now())));
      video.src = source!;
      video.load();
    });
    if (!metadataReady) return summarizeVideoCheckpoints(positions.length, 0);
    for (const position of positions) {
      const remaining = deadline - performance.now();
      if (remaining < 250) break;
      const success = await new Promise<boolean>(resolve => {
        let finished = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (ok: boolean) => {
          if (finished) return;
          finished = true;
          if (timer !== undefined) clearTimeout(timer);
          if (handle && typeof video.cancelVideoFrameCallback === "function") {
            video.cancelVideoFrameCallback(handle);
            handle = 0;
          }
          video.onseeked = null;
          video.onerror = null;
          resolve(ok);
        };
        timer = setTimeout(() => finish(false), Math.min(remaining, 3000));
        video.pause();
        video.onseeked = () => {
          if (finished) return;
          try {
            handle = video.requestVideoFrameCallback((_time, frame) => {
              finish(checkpointFrameMatches(frame.mediaTime, position,
                video.readyState, video.videoWidth, video.videoHeight));
            });
            // Some WebViews return a decoded frame on seek without playback.
            // Autoplay rejection is not file corruption: keep waiting for the
            // real frame callback until the bounded timeout.
            void video.play().catch(() => undefined);
          } catch { finish(false); }
        };
        video.onerror = () => finish(false);
        try { video.currentTime = position; } catch { finish(false); }
      });
      if (!success) break;
      observed++;
    }
  } catch {
    // Decoder/seek support may be missing; never call an unknown a failure.
  } finally {
    if (handle && typeof video.cancelVideoFrameCallback === "function")
      video.cancelVideoFrameCallback(handle);
    video.pause();
    video.onseeked = null;
    video.onloadedmetadata = null;
    video.onerror = null;
    video.removeAttribute("src");
    video.load();
    holder.remove();
    if (source !== null) URL.revokeObjectURL(source);
  }
  return summarizeVideoCheckpoints(positions.length, observed);
}

export async function probeStoredClipCheckpoints(
  clipId: string, durationSeconds: number | null,
): Promise<VideoCheckpointEvidence> {
  const clip = await readPersistedClip(clipId);
  return probeVideoBlobCheckpoints(clip.blob, durationSeconds);
}
