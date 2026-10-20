import { bounded } from "./async";
import { readProxy, writeProxy } from "./media-cache";

/** Real 480p silent scrubbing proxy; audio and export continue using the original. */
export async function generateProxy(id: string, source: string, signal: AbortSignal): Promise<Blob | null> {
  const cached = await readProxy(id); if (cached) return cached;
  if (signal.aborted || typeof MediaRecorder === "undefined") return null;
  const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = source;
  let stream: MediaStream | null = null; let recorder: MediaRecorder | null = null; let raf = 0;
  const stop = () => { cancelAnimationFrame(raf); video.pause(); if (recorder && recorder.state !== "inactive") recorder.stop(); stream?.getTracks().forEach((track) => track.stop()); };
  signal.addEventListener("abort", stop, { once: true });
  try {
    await bounded(new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error("Cannot decode video")); }), 5000, "Proxy metadata");
    if (Math.min(video.videoWidth, video.videoHeight) <= 480 || signal.aborted) return null;
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
      if (!recorder) { reject(new Error("Recorder unavailable")); return; }
      recorder.onstop = () => signal.aborted ? reject(new Error("Proxy cancelled")) : resolve(new Blob(chunks, { type: mime }));
      recorder.onerror = () => reject(new Error("Proxy encoding failed"));
      video.onended = () => { if (recorder?.state !== "inactive") recorder?.stop(); };
      video.onerror = () => reject(new Error("Video decode failed"));
    });
    const draw = () => { if (signal.aborted) return; ctx.drawImage(video, 0, 0, canvas.width, canvas.height); raf = requestAnimationFrame(draw); };
    recorder.start(1000); draw(); await bounded(video.play(), 5000, "Proxy playback");
    const duration = Number.isFinite(video.duration) ? video.duration : 60;
    const blob = await bounded(done, Math.min(600000, duration * 1000 + 10000), "Proxy encoding");
    if (blob.size && !signal.aborted) { await writeProxy(id, blob); return blob; }
    return null;
  } finally { signal.removeEventListener("abort", stop); stop(); video.removeAttribute("src"); video.load(); }
}