import { useEffect, useRef, useState, type RefObject } from "react";
import { AlertTriangle, Mic, Thermometer, Activity } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useMulticamStore, type CaptureMode, type ToneProfile } from "@/lib/multicam-store";
import { HelpDot } from "./Help";
import { MultiCamNative, isNative, thermalLabel, type NativeCapabilities } from "@/lib/native";

const RES: Record<string, [number, number]> = { "720p": [1280, 720], "1080p": [1920, 1080], "2K": [2560, 1440], "4K": [3840, 2160] };
const FPS = [24, 30, 60];
const CODECS: Record<string, string> = { VP8: "video/webm;codecs=vp8,opus", VP9: "video/webm;codecs=vp9,opus", AV1: "video/webm;codecs=av01,opus", "H.264": "video/mp4;codecs=avc1,mp4a.40.2" };
const MODES: { id: CaptureMode; label: string }[] = [{ id: "normal", label: "Обычный" }, { id: "slowmo120", label: "Slow‑mo 120" }, { id: "slowmo240", label: "Slow‑mo 240" }, { id: "timelapse", label: "Time‑lapse" }, { id: "hyperlapse", label: "Hyperlapse" }];
const PROFILES: { id: ToneProfile; label: string }[] = [{ id: "standard", label: "Стандарт" }, { id: "log", label: "LOG" }, { id: "flat", label: "FLAT" }, { id: "directlog", label: "Direct Log" }];

export const codecMime = (codec: string) => CODECS[codec] ?? "video/webm";
export const toneFilter = (p: ToneProfile) => p === "log" ? "contrast(0.72) saturate(0.7) brightness(1.12)" : p === "flat" ? "contrast(0.85) saturate(0.85) brightness(1.05)" : p === "directlog" ? "contrast(0.62) saturate(0.6) brightness(1.18)" : "none";

interface Caps { maxW: number; maxH: number; maxFps: number; iso: [number, number] | null; focus: [number, number] | null; exposure: [number, number] | null; highSpeed: number[] }

export function CaptureProPanel({ stream, videoRef }: { stream: MediaStream | null; videoRef: RefObject<HTMLVideoElement | null> }) {
  const s = useMulticamStore(); const c = s.capture;
  const [caps, setCaps] = useState<Caps | null>(null);
  const [notice, setNotice] = useState("");
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState({ rms: -90, peak: -90 });
  const [dropped, setDropped] = useState(0);
  const [thermal, setThermal] = useState<string>("Недоступно в браузере");
  const peakRef = useRef(-90);
  const m = s.capMatrix?.[s.facing] ?? null; const NS = "Не поддерживается";
  const update = (patch: Partial<typeof c>) => s.set({ capture: { ...c, ...patch } });
  const warn = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice(""), 3500); };

  useEffect(() => {
    const track = stream?.getVideoTracks()[0];
    const tc = (track?.getCapabilities?.() ?? {}) as Record<string, { min?: number; max?: number } | undefined>;
    const range = (k: string): [number, number] | null => tc[k]?.max !== undefined ? [tc[k]!.min ?? 0, tc[k]!.max!] : null;
    const base: Caps = { maxW: tc['width']?.max ?? 0, maxH: tc['height']?.max ?? 0, maxFps: tc['frameRate']?.max ?? 0, iso: range("iso"), focus: range("focusDistance"), exposure: range("exposureTime"), highSpeed: [] };
    if (isNative()) {
      MultiCamNative.getCapabilities().then((n: NativeCapabilities) => {
        const hs = n.cameras.flatMap((cam) => cam.highSpeed.flatMap((h) => h.fps));
        setCaps({ ...base, highSpeed: [...new Set(hs)], maxFps: Math.max(base.maxFps, ...hs.filter((f) => f <= 60), 0) });
      }).catch(() => setCaps(base));
    } else setCaps(base);
  }, [stream]);

  useEffect(() => { navigator.mediaDevices?.enumerateDevices().then((d) => setMics(d.filter((x) => x.kind === "audioinput"))).catch(() => setMics([])); }, [stream]);

  useEffect(() => {
    if (!stream?.getAudioTracks().length) return;
    const ctx = new AudioContext(); const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const buf = new Float32Array(an.fftSize); let raf = 0; let last = 0;
    const tick = (t: number) => {
      an.getFloatTimeDomainData(buf); let sum = 0; let pk = 0;
      for (const v of buf) { sum += v * v; pk = Math.max(pk, Math.abs(v)); }
      const rms = 20 * Math.log10(Math.sqrt(sum / buf.length) || 1e-5); const peak = 20 * Math.log10(pk || 1e-5);
      peakRef.current = Math.max(peak, peakRef.current - 0.6);
      if (t - last > 60) { last = t; setLevel({ rms: Math.max(-90, rms), peak: Math.max(-90, peakRef.current) }); }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); void ctx.close(); };
  }, [stream]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const q = videoRef.current?.getVideoPlaybackQuality?.(); if (q) setDropped(q.droppedVideoFrames);
      if (isNative()) MultiCamNative.getThermalStatus().then((th) => setThermal(`${thermalLabel(th.status)}${th.temperatureC !== null ? ` · ${th.temperatureC.toFixed(1)}°C` : ""}`)).catch(() => setThermal("Нет данных"));
    }, 2000);
    return () => window.clearInterval(id);
  }, [videoRef]);

  const resOk = (r: string) => (!m || m.resolutions.includes(r)) && (!caps || !caps.maxW || (RES[r]![0] <= Math.max(caps.maxW, caps.maxH) && RES[r]![1] <= Math.min(caps.maxW, caps.maxH) + 1));
  const fpsOk = (f: number) => !m || m.fps.includes(f) || (caps?.highSpeed ?? []).includes(f);
  // Available FPS is a candidate only: verify the selected camera/size/FPS together at runtime.
  const codecOk = (k: string) => (!s.capMatrix || s.capMatrix.codecs.includes(k)) && typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(CODECS[k]!);
  const modeOk = (md: CaptureMode) => { const hs = [...(caps?.highSpeed ?? []), ...(m?.highSpeed ?? [])]; const mx = Math.max(caps?.maxFps ?? 0, m?.maxFps ?? 0); return md === "slowmo120" ? hs.includes(120) || mx >= 120 : md === "slowmo240" ? hs.includes(240) || mx >= 240 : true; };
  const blocked = (what: string) => warn(`${what}: не поддерживается ${s.facing === "front" ? "фронтальной" : "основной"} камерой — выбор заблокирован для защиты от перегрева и сбоев.`);

  const applyTrack = (patch: Partial<typeof c>) => {
    const next = { ...c, ...patch };
    const track = stream?.getVideoTracks()[0]; if (!track) { blocked("Камера"); return; }
    const [w, h] = RES[next.resolution]!;
    const advanced: Record<string, unknown>[] = [];
    if (next.iso !== null) advanced.push({ exposureMode: "manual", iso: next.iso });
    if (next.exposure !== null) advanced.push({ exposureMode: "manual", exposureTime: next.exposure });
    if (next.focus !== null) advanced.push({ focusMode: "manual", focusDistance: next.focus });
    void track.applyConstraints({ width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: next.fps }, advanced: advanced as MediaTrackConstraintSet[] }).then(() => {
      const applied = track.getSettings();
      const requestedGeometry = "resolution" in patch || "fps" in patch;
      const actualW = Math.max(applied.width ?? 0, applied.height ?? 0);
      const actualH = Math.min(applied.width ?? 0, applied.height ?? 0);
      const actualFps = applied.frameRate;
      if (requestedGeometry && (actualW !== Math.max(w, h) || actualH !== Math.min(w, h) || (actualFps !== undefined && Math.abs(actualFps - next.fps) > 1))) {
        warn(`Запрошено ${next.resolution} / ${next.fps} FPS, фактически ${applied.width ?? "?"}×${applied.height ?? "?"} / ${actualFps ?? "?"} FPS. Режим не подтверждён.`);
        return;
      }
      update(patch);
    }).catch(() => blocked("Этот режим"));
  };

  const Chip = ({ ok, active, onPick, label, name }: { ok: boolean; active: boolean; onPick: () => void; label: string; name: string }) =>
    <button type="button" aria-disabled={!ok} onClick={() => ok ? onPick() : blocked(name)} className={`rounded-md border px-2.5 py-1.5 text-[11px] font-medium ${active ? "border-primary bg-primary text-primary-foreground" : ok ? "border-border bg-secondary" : "border-border bg-secondary opacity-35"}`}>{label}{!ok && <span className="ms-1 text-[9px]">· {NS}</span>}</button>;
  const meter = (db: number) => `${Math.min(100, Math.max(0, ((db + 60) / 60) * 100))}%`;

  return <div className="mt-3 space-y-3 rounded-lg bg-card p-3 text-xs">
    {notice && <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/15 p-2 text-[11px]"><AlertTriangle className="size-4 shrink-0 text-warning" />{notice}</div>}
    <Row title="Разрешение" help="resolution">{Object.keys(RES).map((r) => <Chip key={r} name={r} label={r} ok={resOk(r)} active={c.resolution === r} onPick={() => applyTrack({ resolution: r })} />)}</Row>
    <Row title="Кадры/с" help="fps">{FPS.map((f) => <Chip key={f} name={`${f} fps`} label={`${f}`} ok={fpsOk(f)} active={c.fps === f} onPick={() => applyTrack({ fps: f })} />)}</Row>
    <Row title="Кодек" help="codec">{Object.keys(CODECS).map((k) => <Chip key={k} name={`Кодек ${k}`} label={k} ok={codecOk(k)} active={c.codec === k} onPick={() => update({ codec: k })} />)}</Row>
    <Row title="Режим" help="mode">{MODES.map((m) => <Chip key={m.id} name={m.label} label={m.label} ok={modeOk(m.id) && (!s.recording)} active={c.mode === m.id} onPick={() => update({ mode: m.id })} />)}</Row>
    <Row title="Профиль" help="profile">{PROFILES.map((p) => <Chip key={p.id} name={p.label} label={p.label} ok active={c.profile === p.id} onPick={() => update({ profile: p.id })} />)}</Row>
    <Manual label="ISO" help="manualIso" range={m ? m.iso : caps?.iso ?? null} value={c.iso} onChange={(iso) => applyTrack({ iso })} />
    <Manual label="Выдержка (экспозиция)" help="exposure" range={m ? m.exposure : caps?.exposure ?? null} value={c.exposure} onChange={(exposure) => applyTrack({ exposure })} />
    <Manual label="Фокус" help="focus" range={m ? m.focus : caps?.focus ?? null} value={c.focus} step={0.01} onChange={(focus) => applyTrack({ focus })} />
    <label className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><Mic className="size-3.5" />Микрофон<HelpDot id="mic" /></span>
      <select value={c.micId} onChange={(e) => { update({ micId: e.target.value }); if (isNative()) void MultiCamNative.setPreferredAudioInput({ id: e.target.value }).catch(() => undefined); }} className="max-w-[60%] truncate rounded-md border border-border bg-secondary px-2 py-1.5">
        <option value="">По умолчанию</option>{mics.map((m, i) => <option key={m.deviceId || i} value={m.deviceId}>{m.label || `Микрофон ${i + 1}`}</option>)}
      </select></label>
    <div><div className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>VU {level.rms.toFixed(0)} dB</span><span className="flex items-center gap-1">PPM {level.peak.toFixed(0)} dB<HelpDot id="meters" /></span></div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-secondary"><div className="absolute inset-y-0 left-0 bg-status transition-[width] duration-75" style={{ width: meter(level.rms) }} /><div className="absolute inset-y-0 w-0.5 bg-record" style={{ left: meter(level.peak) }} /></div></div>
    <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground"><span className="flex items-center gap-1"><Activity className="size-3" />Пропущено кадров: <b className={dropped ? "text-warning" : "text-foreground"}>{dropped}</b></span><span className="flex items-center gap-1"><Thermometer className="size-3" />{thermal}</span></div>
  </div>;
}

function Row({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return <div><p className="mb-1.5 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">{title}{help && <HelpDot id={help} />}</p><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}
function Manual({ label, help, range, value, onChange, step = 1 }: { label: string; help?: string; range: [number, number] | null; value: number | null; onChange: (v: number | null) => void; step?: number }) {
  if (!range) return <div className="flex justify-between text-muted-foreground"><span className="flex items-center gap-1">{label}{help && <HelpDot id={help} />}</span><span className="text-[10px]">Не поддерживается</span></div>;
  return <div><div className="mb-1.5 flex justify-between"><span className="flex items-center gap-1">{label}{help && <HelpDot id={help} />}</span><button type="button" className="text-[10px] text-primary" onClick={() => onChange(value === null ? range[0] : null)}>{value === null ? "Авто" : value.toFixed(step < 1 ? 2 : 0)}</button></div>
    <Slider disabled={value === null} value={[value ?? range[0]]} min={range[0]} max={range[1]} step={step} onValueChange={([v = range[0]]) => onChange(v)} /></div>;
}
