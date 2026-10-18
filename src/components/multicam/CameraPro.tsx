import { useEffect, useRef, useState, type FormEvent, type RefObject } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useMulticamStore, type ShootSettings } from "@/lib/multicam-store";
import { isNative } from "@/lib/native";
import { HelpDot } from "./Help";
import { clipCurve } from "@/lib/audio-limiter";

/* ---------- Track helpers (all features are capability-checked at runtime) ---------- */
type Caps = Record<string, unknown>;
export const trackCaps = (stream: MediaStream | null): Caps => (stream?.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as Caps;
export const capRange = (caps: Caps, key: string): [number, number, number] | null => {
  const r = caps[key] as { min?: number; max?: number; step?: number } | undefined;
  return r && typeof r.max === "number" && r.max > (r.min ?? 0) ? [r.min ?? 0, r.max, r.step && r.step > 0 ? r.step : (r.max - (r.min ?? 0)) / 1000] : null;
};
export const capModes = (caps: Caps, key: string) => (caps[key] as string[] | undefined) ?? [];
export function applyAdvanced(stream: MediaStream | null, c: Record<string, unknown>) {
  const track = stream?.getVideoTracks()[0]; if (!track?.applyConstraints) return Promise.resolve(false);
  return track.applyConstraints({ advanced: [c] } as MediaTrackConstraints).then(() => true).catch(() => false);
}

/* ---------- Color tuning (preview + recording canvas) ---------- */
export const tuneActive = (s: { tint: number; tuneContrast: number; tuneShadows: number; tuneSaturation: number }) => s.tint !== 0 || s.tuneContrast !== 0 || s.tuneShadows !== 0 || s.tuneSaturation !== 0;
export const tuneFilter = (s: { tint: number; tuneContrast: number; tuneShadows: number; tuneSaturation: number }) => {
  const parts: string[] = [];
  if (s.tuneContrast) parts.push(`contrast(${1 + s.tuneContrast / 100})`);
  if (s.tuneSaturation) parts.push(`saturate(${Math.max(0, 1 + s.tuneSaturation / 100)})`);
  if (s.tuneShadows) parts.push(`brightness(${1 + s.tuneShadows / 250})`);
  if (s.tint) parts.push(`hue-rotate(${s.tint * 0.25}deg)`, `saturate(${1 + Math.abs(s.tint) / 400})`);
  return parts.join(" ");
};
export const kelvinFilter = (k: number | null) => k === null ? "" : k < 5600 ? `sepia(${((5600 - k) / 3100) * 0.35})` : `hue-rotate(${((k - 5600) / 2400) * -12}deg) saturate(.92)`;

/* ---------- Photo storage ---------- */
export function savePhoto(blob: Blob, meta: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("multicam-pov-photos", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("photos", { keyPath: "id" });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const tx = req.result.transaction("photos", "readwrite"); tx.objectStore("photos").put({ id: `photo-${Date.now()}-${Math.floor(Math.random() * 1e4)}`, createdAt: Date.now(), blob, ...meta }); tx.oncomplete = () => { window.dispatchEvent(new Event("multicam-photos-changed")); resolve(); }; tx.onerror = () => reject(tx.error); };
  });
}

/** Draws the current video frame (or an average of several frames) into a canvas with the preview filter. */
export async function grabFrames(video: HTMLVideoElement, filter: string, frames: number, spanMs: number): Promise<Blob | null> {
  const w = video.videoWidth, h = video.videoHeight; if (!w || !h) return null;
  const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) return null;
  ctx.filter = filter || "none";
  if (frames <= 1) { ctx.drawImage(video, 0, 0, w, h); }
  else {
    const acc = new Float32Array(w * h * 4);
    for (let k = 0; k < frames; k++) {
      ctx.drawImage(video, 0, 0, w, h); const d = ctx.getImageData(0, 0, w, h).data;
      for (let i = 0; i < d.length; i++) acc[i]! += d[i]!;
      if (k < frames - 1) await new Promise((r) => window.setTimeout(r, spanMs / frames));
    }
    const out = ctx.createImageData(w, h);
    for (let i = 0; i < acc.length; i++) out.data[i] = acc[i]! / frames;
    ctx.filter = "none"; ctx.putImageData(out, 0, 0);
  }
  return new Promise((r) => c.toBlob((b) => r(b), "image/jpeg", 0.93));
}

/* ---------- Face tracking + hybrid focus (browser FaceDetector when available) ---------- */
interface Box { x: number; y: number; w: number; h: number }
type FaceDetectorCtor = new (o?: { fastMode?: boolean; maxDetectedFaces?: number }) => { detect: (src: HTMLVideoElement) => Promise<{ boundingBox: DOMRectReadOnly }[]> };
export const faceDetectorAvailable = () => typeof window !== "undefined" && "FaceDetector" in window;
export function useFaceTracking(videoRef: RefObject<HTMLVideoElement | null>, stream: MediaStream | null, enabled: boolean, hybrid: boolean) {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    if (!enabled || !faceDetectorAvailable()) { setBox(null); return; }
    const Ctor = (window as unknown as { FaceDetector: FaceDetectorCtor }).FaceDetector;
    const det = new Ctor({ fastMode: true, maxDetectedFaces: 4 }); let alive = true; let last: "face" | "center" | null = null;
    const caps = trackCaps(stream); const poi = "pointsOfInterest" in caps;
    const loop = async () => {
      const v = videoRef.current;
      if (v && v.videoWidth) {
        try {
          const faces = await det.detect(v);
          const big = faces.map((f) => f.boundingBox).sort((a, b) => b.width * b.height - a.width * a.height)[0];
          if (big) {
            const b = { x: big.x / v.videoWidth, y: big.y / v.videoHeight, w: big.width / v.videoWidth, h: big.height / v.videoHeight }; setBox(b);
            if (poi) void applyAdvanced(stream, { focusMode: "continuous", pointsOfInterest: [{ x: b.x + b.w / 2, y: b.y + b.h / 2 }] });
            last = "face";
          } else {
            setBox(null);
            // Hybrid nearest priority: face hidden (e.g. a product held up) → focus the frame centre, return to the face when it reappears.
            if (hybrid && poi && last !== "center") { void applyAdvanced(stream, { focusMode: "continuous", pointsOfInterest: [{ x: 0.5, y: 0.5 }] }); last = "center"; }
          }
        } catch { /* frame not ready */ }
      }
      if (alive) window.setTimeout(() => void loop(), 120);
    };
    void loop();
    return () => { alive = false; };
  }, [enabled, hybrid, stream, videoRef]);
  return box;
}

/* ---------- False color ---------- */
const IRE: [number, [number, number, number]][] = [[0.02, [128, 0, 160]], [0.1, [0, 60, 255]], [0.2, [0, 140, 200]], [0.38, [90, 90, 90]], [0.45, [0, 200, 70]], [0.52, [150, 150, 150]], [0.62, [255, 120, 180]], [0.77, [190, 190, 190]], [0.93, [255, 230, 0]], [0.99, [255, 120, 0]], [1.01, [255, 0, 0]]];
export function FalseColorOverlay({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0; let last = 0; const lut = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) { const l = i / 255; const c = IRE.find(([lim]) => l < lim)?.[1] ?? [255, 0, 0]; lut.set(c, i * 3); }
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick); if (t - last < 66) return; last = t;
      const v = videoRef.current; const c = canvas.current; if (!v || !c || !v.videoWidth) return;
      const w = 240; const h = Math.round((w * v.videoHeight) / v.videoWidth); c.width = w; c.height = h;
      const ctx = c.getContext("2d", { willReadFrequently: true }); if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h); const img = ctx.getImageData(0, 0, w, h); const d = img.data;
      for (let i = 0; i < d.length; i += 4) { const y = Math.round(0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!); d[i] = lut[y * 3]!; d[i + 1] = lut[y * 3 + 1]!; d[i + 2] = lut[y * 3 + 2]!; }
      ctx.putImageData(img, 0, 0);
    };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [videoRef]);
  return <canvas ref={canvas} aria-label="Ложные цвета" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-90 [image-rendering:pixelated]" />;
}

/* ---------- Vertical VU meter + gain + peak limiter ceiling ---------- */
/** Native range 0…24 dB (default +18). 0 = mic muted, 18 = unity gain. The value drives a live GainNode and
 *  the limiter ceiling, so the VU bar (−60…0 dB scale) can never rise above the slider position. */
export const KNOB_MAX = 24;
export const KNOB_DEFAULT = 18;
export const knobToGain = (k: number) => k <= 0 ? 0 : Math.pow(10, (k - KNOB_DEFAULT) / 20);
export const knobToCeiling = (k: number) => -60 + (Math.max(0, Math.min(KNOB_MAX, k)) * 60) / KNOB_MAX;
export const ceilingToKnob = (c: number) => Math.round((((Math.max(-60, Math.min(0, c)) + 60) * KNOB_MAX) / 60) * 10) / 10;
const SCALE = ["0 дБ", "+6 дБ", "+12 дБ", "+18 дБ", "+24 дБ"];
type LiveGraph = { ctx: AudioContext; g: GainNode; comp: DynamicsCompressorNode; clip: WaveShaperNode };
export function AudioRail({ stream }: { stream: MediaStream | null }) {
  const ceiling = useMulticamStore((x) => x.audioCeiling); const set = useMulticamStore((x) => x.set);
  const [rms, setRms] = useState(-90);
  const [knob, setKnobState] = useState(KNOB_DEFAULT);
  const knobRef = useRef(KNOB_DEFAULT);
  const graph = useRef<LiveGraph | null>(null);
  // Push a value straight into the live Web Audio nodes (no graph rebuild, no React round-trip).
  const applyLive = (k: number) => {
    const n = graph.current; if (!n) return;
    const t = n.ctx.currentTime; const c = knobToCeiling(k);
    n.g.gain.setTargetAtTime(knobToGain(k), t, 0.01);
    n.comp.threshold.setTargetAtTime(Math.max(-100, Math.min(0, c)), t, 0.01);
    n.clip.curve = clipCurve(c);
  };
  // Mount: strictly start at +18 dB.
  useEffect(() => { set({ audioGain: knobToGain(KNOB_DEFAULT), audioCeiling: knobToCeiling(KNOB_DEFAULT) }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!stream?.getAudioTracks().length) return;
    const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream);
    const g = ctx.createGain(); const comp = ctx.createDynamicsCompressor();
    comp.knee.value = 0; comp.ratio.value = 20; comp.attack.value = 0.001; comp.release.value = 0.05;
    const clip = ctx.createWaveShaper(); clip.oversample = "4x";
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    src.connect(g); g.connect(comp); comp.connect(clip); clip.connect(an);
    graph.current = { ctx, g, comp, clip };
    const k0 = knobRef.current; g.gain.value = knobToGain(k0); comp.threshold.value = knobToCeiling(k0); clip.curve = clipCurve(knobToCeiling(k0));
    const buf = new Float32Array(an.fftSize); let raf = 0; let last = 0;
    const tick = (t: number) => {
      an.getFloatTimeDomainData(buf); let sum = 0; for (const v of buf) sum += v * v;
      if (t - last > 40) { last = t; setRms(Math.max(-90, 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-5))); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); graph.current = null; void ctx.close(); };
  }, [stream]);
  const hasMic = !!stream?.getAudioTracks().length;
  const onSlide = (e: React.FormEvent<HTMLInputElement>) => {
    const k = Number(e.currentTarget.value);
    knobRef.current = k; setKnobState(k); applyLive(k);
    void graph.current?.ctx.resume();
    set({ audioCeiling: knobToCeiling(k), audioGain: knobToGain(k) });
  };
  const pct = (v: number) => Math.min(100, Math.max(0, ((v + 60) / 60) * 100));
  const ceilPct = pct(ceiling);
  const level = hasMic && knob > 0 ? Math.min(pct(rms), ceilPct) : 0;
  return <div className="glass-panel absolute end-2 top-1/2 z-20 flex -translate-y-1/2 rounded-2xl py-3 ps-2 pe-3">
    <div className="flex h-48 items-stretch">
      <div className="flex w-3 flex-col items-center py-[24px]">
        <div className="relative h-full w-2.5 overflow-hidden rounded-full bg-secondary" role="meter" aria-valuenow={Math.round(level)} aria-valuemin={0} aria-valuemax={100} aria-label="Уровень звука">
          <div className="vu-fill absolute inset-x-0 bottom-0 transition-[height] duration-75" style={{ height: `${level}%` }} />
        </div>
      </div>
      <input type="range" className="gain-range" aria-label="Усиление микрофона" aria-valuetext={`+${knob.toFixed(1)} дБ`} min={0} max={KNOB_MAX} step={0.1} value={knob} onInput={onSlide} onChange={onSlide} />
      <div className="relative w-8 py-[24px]" aria-hidden>
        <div className="relative h-full">{SCALE.map((l, i) => <span key={l} className={`absolute start-0 -translate-y-1/2 whitespace-nowrap font-mono text-[8px] leading-none ${i === 3 ? "font-bold text-foreground" : "text-muted-foreground"}`} style={{ bottom: `calc(${(i / (SCALE.length - 1)) * 100}% - 4px)` }}>{l}</span>)}</div>
      </div>
    </div>
  </div>;
}

/* ---------- Manual focus rail ---------- */
export function FocusRail({ stream }: { stream: MediaStream | null }) {
  const s = useMulticamStore(); const caps = trackCaps(stream); const range = capRange(caps, "focusDistance") ?? (s.capMatrix?.[s.facing].focus ? [...s.capMatrix[s.facing].focus!, 0.01] as [number, number, number] : null);
  if (!range) return <p className="glass-panel rounded-full px-3 py-1 text-center text-[10px] text-muted-foreground">Ручной фокус: камера не сообщает диапазон фокусировки</p>;
  const [min, max, step] = range; const v = s.capture.focus;
  return <div className="glass-panel flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px]">
    <button className={`shrink-0 font-semibold ${v === null ? "text-primary" : "text-muted-foreground"}`} onClick={() => { s.set({ capture: { ...s.capture, focus: null } }); void applyAdvanced(stream, { focusMode: "continuous" }); }}>AF</button>
    <span className="shrink-0 text-muted-foreground">Близко</span>
    <Slider aria-label="Ручной фокус" className="flex-1" value={[v ?? min]} min={min} max={max} step={step} onValueChange={([x = min]) => { s.set({ capture: { ...s.capture, focus: x } }); void applyAdvanced(stream, { focusMode: "manual", focusDistance: x }); }} />
    <span className="shrink-0 text-muted-foreground">Далеко</span>
    <span className="w-10 shrink-0 text-end font-mono">{v === null ? "Авто" : v.toFixed(2)}</span>
  </div>;
}

/* ---------- Lens selector + smooth zoom ---------- */
export function LensZoomBlock({ stream }: { stream: MediaStream | null }) {
  const s = useMulticamStore(); const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => { void navigator.mediaDevices?.enumerateDevices().then((d) => setDevices(d.filter((x) => x.kind === "videoinput"))).catch(() => setDevices([])); }, [stream]);
  const zr = capRange(trackCaps(stream), "zoom");
  const ultra = devices.find((d) => /ultra|wide|0\.5|широк/i.test(d.label) && !/front|user|фронт/i.test(d.label));
  const tele = devices.find((d) => /tele|zoom|телефото/i.test(d.label));
  const lenses: { label: string; zoom?: number; deviceId?: string }[] = [];
  if (zr && zr[0] <= 0.5) lenses.push({ label: "0.5x", zoom: 0.5 }); else if (ultra) lenses.push({ label: "0.5x", deviceId: ultra.deviceId });
  if (zr || devices.length) lenses.push({ label: "1x", zoom: 1 });
  for (const z of [2, 3, 5]) if (zr && zr[1] >= z) lenses.push({ label: `${z}x`, zoom: z }); else if (z === 2 && tele) lenses.push({ label: "2x", deviceId: tele.deviceId });
  const setZoom = (z: number) => { s.set({ zoom: z, lensDeviceId: "" }); void applyAdvanced(stream, { zoom: z }); };
  if (!lenses.length) return <p className="text-[10px] text-muted-foreground">Камера не сообщает объективы и зум</p>;
  return <div className="space-y-2">
    <div className="flex justify-center gap-1.5">{lenses.map((l) => { const active = l.deviceId ? s.lensDeviceId === l.deviceId : !s.lensDeviceId && Math.abs((s.zoom ?? 1) - (l.zoom ?? 1)) < 0.05; return <button key={l.label} onClick={() => l.deviceId ? s.set({ lensDeviceId: l.deviceId }) : setZoom(Math.min(zr?.[1] ?? 1, Math.max(zr?.[0] ?? 1, l.zoom ?? 1)))} className={`size-10 rounded-full text-[11px] font-semibold ${active ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{l.label}</button>; })}</div>
    {zr ? <div><div className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>Плавный зум</span><span className="font-mono">{(s.zoom ?? 1).toFixed(2)}x</span></div><Slider aria-label="Зум" value={[s.zoom ?? 1]} min={zr[0]} max={zr[1]} step={Math.max(0.01, zr[2])} onValueChange={([z = 1]) => setZoom(z)} /></div>
      : <p className="text-[10px] text-muted-foreground">Плавный зум недоступен у этой камеры — переключение объективами</p>}
  </div>;
}

/* ---------- Color tuning panel ---------- */
export function ColorTuning() {
  const s = useMulticamStore();
  const Row = ({ label, help, v, min, max, step = 1, on, unit = "", grad }: { label: string; help?: string; v: number; min: number; max: number; step?: number; on: (v: number) => void; unit?: string; grad?: string }) =>
    <div><div className="mb-1.5 flex items-center justify-between text-[11px]"><span className="flex items-center gap-1">{label}{help && <HelpDot id={help} />}</span><span className="font-mono text-muted-foreground">{v}{unit}</span></div>
      <div className="relative">{grad && <div className={`pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full ${grad}`} />}<Slider value={[v]} min={min} max={max} step={step} onValueChange={([x = v]) => on(x)} /></div></div>;
  return <div className="space-y-3">
    <Row label="Kelvin" help="wbKelvin" v={s.wbKelvin ?? 5600} min={2500} max={8000} step={100} unit="K" grad="kelvin-track" on={(wbKelvin) => s.set({ wbKelvin, wbLock: true })} />
    <Row label="Оттенок" help="cTint" v={s.tint} min={-100} max={100} grad="tint-track" on={(tint) => s.set({ tint })} />
    <p className="pt-1 text-[10px] uppercase tracking-wide text-muted-foreground">Глубокая настройка</p>
    <Row label="Контраст" v={s.tuneContrast} min={-100} max={100} on={(tuneContrast) => s.set({ tuneContrast })} />
    <Row label="Тени" v={s.tuneShadows} min={-100} max={100} on={(tuneShadows) => s.set({ tuneShadows })} />
    <Row label="Насыщенность" v={s.tuneSaturation} min={-100} max={100} on={(tuneSaturation) => s.set({ tuneSaturation })} />
    <button className="w-full rounded-md bg-secondary py-1.5 text-[11px]" onClick={() => s.set({ wbKelvin: null, wbLock: false, tint: 0, tuneContrast: 0, tuneShadows: 0, tuneSaturation: 0 })}>Сбросить цвет</button>
  </div>;
}

/* ---------- Advanced shooting modes ---------- */
export function shootAvailability(stream: MediaStream | null, rawNative: boolean) {
  const caps = trackCaps(stream);
  return {
    timer: true, burst: true, interval: true, night: true, longExp: true,
    bracket: !!capRange(caps, "exposureCompensation"),
    // DNG capture needs a native Camera2 RAW pipeline that is not wired yet; availability stays false until it exists.
    raw: false && rawNative,
  } as Record<keyof ShootSettings, boolean>;
}
const MODE_LIST: { key: keyof ShootSettings; label: string; hint: string }[] = [
  { key: "timer", label: "Таймер", hint: "Задержка перед снимком" },
  { key: "burst", label: "Серия", hint: "5 кадров подряд" },
  { key: "bracket", label: "Брекетинг", hint: "−2 / 0 / +2 EV" },
  { key: "interval", label: "Интервал", hint: "Снимок каждые N с" },
  { key: "raw", label: "RAW", hint: "DNG с сенсора" },
  { key: "night", label: "Ночь", hint: "Стек 8 кадров" },
  { key: "longExp", label: "Выдержка", hint: "Накопление 2 с" },
];
export function ShootingModes({ stream, rawNative }: { stream: MediaStream | null; rawNative: boolean }) {
  const s = useMulticamStore(); const sh = s.shoot; const avail = shootAvailability(stream, rawNative);
  const reason = (k: keyof ShootSettings) => k === "bracket" ? "камера не даёт экспокоррекцию" : k === "raw" ? (!isNative() ? "только в Android‑приложении" : rawNative ? "сенсор умеет RAW, запись DNG не подключена" : "сенсор не отдаёт RAW") : "";
  const toggle = (k: keyof ShootSettings) => {
    if (!avail[k]) return;
    if (k === "timer") s.set({ shoot: { ...sh, timer: sh.timer === 0 ? 3 : sh.timer === 3 ? 10 : 0 } });
    else if (k === "interval") s.set({ shoot: { ...sh, interval: sh.interval === 0 ? 2 : sh.interval === 2 ? 5 : sh.interval === 5 ? 10 : 0 } });
    else {
      // Burst, bracketing, night and long exposure are mutually exclusive frame strategies.
      const exclusive: (keyof ShootSettings)[] = ["burst", "bracket", "night", "longExp"];
      const next = { ...sh, [k]: !sh[k] } as ShootSettings;
      if (exclusive.includes(k) && next[k]) for (const e of exclusive) if (e !== k) (next as unknown as Record<string, unknown>)[e] = false;
      s.set({ shoot: next });
    }
  };
  return <div className="space-y-2">
    {s.captureKind !== "photo" && <p className="text-[10px] text-muted-foreground">Режимы применяются в режиме ФОТО. Интервал в ВИДЕО = Time‑lapse.</p>}
    <div className="grid grid-cols-4 gap-1.5">{MODE_LIST.map(({ key, label, hint }) => {
      const on = key === "timer" ? sh.timer > 0 : key === "interval" ? sh.interval > 0 : !!sh[key];
      const value = key === "timer" && sh.timer ? `${sh.timer}с` : key === "interval" && sh.interval ? `${sh.interval}с` : "";
      return <button key={key} aria-pressed={on} aria-disabled={!avail[key]} title={avail[key] ? hint : reason(key)} onClick={() => toggle(key)} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-center text-[10px] font-semibold ${on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-secondary"} ${avail[key] ? "" : "opacity-35"}`}>
        <span>{label}{value && ` · ${value}`}</span><span className="text-[8px] font-normal opacity-75">{avail[key] ? hint : reason(key)}</span></button>;
    })}</div>
    <label className="flex items-center justify-between text-[11px]"><span>ML‑ночной режим (стек кадров + шумодав)</span><Switch checked={sh.night && s.aiEnabled} disabled={!sh.night} onCheckedChange={(v) => s.set({ aiEnabled: v })} /></label>
  </div>;
}
