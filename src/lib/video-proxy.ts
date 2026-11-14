import { bounded } from "./async";
import { readProxy, writeProxy } from "./media-cache";
import { shouldAutoEncodeFullProxy } from "./editor-longform-policy";

/** Real 480p silent scrubbing proxy; audio and export continue using the original. */
export async function generateProxy(id: string, source: string, signal: AbortSignal): Promise<Blob | null> {
  const cached = await readProxy(id); if (signal.aborted) return null; if (cached) return cached;
  if (signal.aborted || typeof MediaRecorder === "undefined") return null;
  const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.preload = "auto";
  let stream: MediaStream | null = null; let recorder: MediaRecorder | null = null; let raf = 0;
  let rejectPending: ((error: Error) => void) | null = null;
  const stop = () => {
    // MediaRecorder.stop() is not guaranteed to send an onstop event when
    // Android destroys its codec. Release the waiting editor queue on abort.
    rejectPending?.(new Error("Proxy cancelled"));
    rejectPending = null;
    cancelAnimationFrame(raf);
    video.pause();
    if (recorder && recorder.state !== "inactive") {
      try { recorder.stop(); } catch { /* The encoder may already be closing. */ }
    }
    stream?.getTracks().forEach((track) => track.stop());
  };
  signal.addEventListener("abort", stop, { once: true });
  try {
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onError);
        signal.removeEventListener("abort", onAbort);
        if (error) reject(error); else resolve();
      };
      const onReady = () => finish();
      const onError = () => finish(new Error("Cannot decode video"));
      const onAbort = () => finish(new Error("Proxy cancelled"));
      const timeout = setTimeout(() => finish(new Error("Proxy metadata: timeout")), 5000);
      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) { onAbort(); return; }
      try { video.src = source; video.load(); }
      catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
    });
    if (signal.aborted) return null;
    if (Math.min(video.videoWidth, video.videoHeight) <= 480 || signal.aborted ||
        !shouldAutoEncodeFullProxy(video.duration)) return null;
    const canvas = document.createElement("canvas");
    const scale = 480 / Math.min(video.videoWidth, video.videoHeight);
    canvas.width = Math.round(video.videoWidth * scale / 2) * 2; canvas.height = Math.round(video.videoHeight * scale / 2) * 2;
    const ctx = canvas.getContext("2d"); if (!ctx || !canvas.captureStream) return null;
    const mime = ["video/webm;codecs=vp8", "video/webm;codecs=vp9", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) return null;
    stream = canvas.captureStream(24); recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 900000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const done = new Promise<Blob>((resolve, reject) => {
      let settled = false;
      let stopWatchdog: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (stopWatchdog !== null) clearTimeout(stopWatchdog);
        stopWatchdog = null;
        rejectPending = null;
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        finish();
        reject(error);
      };
      const succeed = (blob: Blob) => {
        if (settled) return;
        settled = true;
        finish();
        resolve(blob);
      };
      rejectPending = fail;
      if (!recorder) { fail(new Error("Recorder unavailable")); return; }
      recorder.onstop = () => signal.aborted
        ? fail(new Error("Proxy cancelled")) : succeed(new Blob(chunks, { type: mime }));
      recorder.onerror = () => fail(new Error("Proxy encoding failed"));
      video.onended = () => {
        if (recorder?.state !== "inactive") {
          try { recorder?.stop(); }
          catch { fail(new Error("Proxy encoder could not stop")); return; }
        }
        // Some Android MediaCodec implementations never emit onstop after
        // end-of-video. Do not hold all subsequent editor jobs for ten minutes.
        stopWatchdog ??= setTimeout(() => fail(new Error("Proxy encoder stop timeout")), 2500);
      };
      video.onerror = () => fail(new Error("Video decode failed"));
    });
    // The encoder can fail before video.play() resolves. Observe its rejection
    // immediately, even when the playback setup never reaches await done.
    void done.catch(() => undefined);
    // Phase-locked 24 fps: at 60Hz the naive "now-last >= 41.7ms"
    // check silently produces 20fps. Preserve all requested proxy frames
    // while avoiding 60/90/120 fps canvas copying and accumulated drift.
    let deadline = Number.NEGATIVE_INFINITY;
    const draw = (now: number) => {
      if (signal.aborted) return;
      const interval = 1000 / 24;
      if (now + 0.75 >= deadline + interval) {
        deadline = now - deadline >= 2 * interval ? now : deadline + interval;
        if (video.readyState >= 2) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      raf = requestAnimationFrame(draw);
    };
    if (signal.aborted) throw new Error("Proxy cancelled");
    recorder.start(1000); draw(performance.now()); await bounded(video.play(), 5000, "Proxy playback");
    const duration = Number.isFinite(video.duration) ? video.duration : 60;
    const blob = await bounded(done, Math.min(600000, duration * 1000 + 10000), "Proxy encoding");
    if (blob.size && !signal.aborted) { await writeProxy(id, blob, signal); return signal.aborted ? null : blob; }
    return null;
  } finally { signal.removeEventListener("abort", stop); stop(); video.removeAttribute("src"); video.load(); }
}