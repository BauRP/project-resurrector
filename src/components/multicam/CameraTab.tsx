import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronDown, CircleDot, Eye, EyeOff, Focus, Lock, Maximize, Pause, Play, ScanFace, SlidersHorizontal, Video, X, Zap, Sparkles, Grid3x3, Circle, Crosshair, Palette, AudioLines, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useMulticamStore, type GridMode } from "@/lib/multicam-store";
import { useT, type TipKey } from "@/lib/i18n";
import { mesh } from "@/lib/mesh";
import { LongPressLabel, ProTipPopover, useLongPress } from "./ProTip";
import { useMeshPeers } from "./useMesh";
import { HelpDot } from "./Help";
import { CaptureProPanel, codecMime, toneFilter } from "./CaptureProPanel";
import { AudioRail, ColorTuning, FalseColorOverlay, FocusRail, LensZoomBlock, ShootingModes, applyAdvanced, capRange, faceDetectorAvailable, grabFrames, kelvinFilter, savePhoto, trackCaps, tuneActive, tuneFilter, useFaceTracking } from "./CameraPro";
import { MultiCamNative, hybridAI, isNative, nativeMetering } from "@/lib/native";
import { requestMediaStream } from "@/lib/capabilities";
import { buildLimiter } from "@/lib/audio-limiter";
const wait = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

const tools = [
  ["focusPeaking", "peak", Focus], ["zebras", "zebra", Zap], ["wbLock", "wb", Lock], ["isoLock", "iso", Lock],
] as const;
const SHUTTERS = ["1/24", "1/48", "1/60", "1/120", "1/250", "1/500"];
const GRIDS: { id: GridMode; label: string }[] = [{ id: "off", label: "Выкл" }, { id: "thirds", label: "Трети" }, { id: "cross", label: "Крест" }, { id: "golden", label: "Золотое" }, { id: "level", label: "Уровень" }];
type Hud = "shutter" | "iso" | "wb" | "grid" | null;

/** Push manual exposure / ISO / WB to the camera track when the device supports it. */
function applyManual(stream: MediaStream | null, c: Record<string, unknown>) {
  const track = stream?.getVideoTracks()[0]; if (!track?.getCapabilities) return;
  const caps = track.getCapabilities() as Record<string, unknown>;
  const adv: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) if (k in caps || k.endsWith("Mode")) adv[k] = v;
  void track.applyConstraints({ advanced: [adv] } as MediaTrackConstraints).catch(() => undefined);
}

export function CameraTab() {
  const s = useMulticamStore();
  const { t } = useT();
  const peers = useMeshPeers();
  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"loading" | "live" | "simulated">("simulated");
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const facingMode = s.facing === "front" ? "user" : "environment";
  const camCaps = s.capMatrix ? s.capMatrix[s.facing] : null;
  const NS = "Не поддерживается";
  const [tipKey, setTipKey] = useState<TipKey | null>(null);
  const [hud, setHud] = useState<Hud>(null);
  const [sheet, setSheet] = useState(false);
  const [self, setSelf] = useState<{ battery: number | null; storageMB: number | null }>({ battery: null, storageMB: null });
  const clean = s.cleanFrame;

  useEffect(() => { void mesh.sendTelemetry().then(setSelf); const id = window.setInterval(() => void mesh.sendTelemetry().then(setSelf), 5000); return () => window.clearInterval(id); }, []);
  useEffect(() => () => s.set({ cleanFrame: false }), []);

  // Hardware detection never starts camera preview or requests permissions.
  useEffect(() => {
    if (s.recording && !cameraEnabled) setCameraEnabled(true);
  }, [s.recording, cameraEnabled]);
  useEffect(() => {
    if (!cameraEnabled) return;
    let mounted = true;
    setCameraState("loading");
    setCameraError("");
    const video = s.lensDeviceId ? { deviceId: { exact: s.lensDeviceId } } : { facingMode };
    const audio = s.capture.micId ? { deviceId: { exact: s.capture.micId } } : true;
    void requestMediaStream({ video, audio })
      .catch(() => requestMediaStream({ video, audio: false }))
      .then((next) => {
        if (!mounted) { next.getTracks().forEach((track) => track.stop()); return; }
        setStream(next);
        setCameraState("live");
        if (!next.getAudioTracks().length) setCameraError("Микрофон недоступен — видео без звука");
      })
      .catch(() => {
        if (!mounted) return;
        setCameraState("simulated");
        setCameraError("Камера недоступна. Проверьте разрешения Android и настройки эмулятора.");
      });
    return () => {
      mounted = false;
      setStream((current) => { current?.getTracks().forEach((track) => track.stop()); return null; });
    };
  }, [cameraEnabled, facingMode, s.capture.micId, s.lensDeviceId]);
  // Pro tools: AI engine, metering, face tracking, RAW capability, photo capture.
  const [aiEngine, setAiEngine] = useState<"native" | "web" | null>(null);
  useEffect(() => { if (!s.aiEnabled) { setAiEngine(null); if (isNative()) void hybridAI(false, s.focusModeAI); return; } void hybridAI(true, s.focusModeAI).then(setAiEngine); }, [s.aiEnabled, s.focusModeAI]);
  const [rawNative, setRawNative] = useState(false);
  useEffect(() => { if (isNative()) void MultiCamNative.getCapabilities().then((n) => setRawNative(n.cameras.some((c) => c.raw))).catch(() => setRawNative(false)); }, []);
  const [meterOk, setMeterOk] = useState(true);
  useEffect(() => {
    const caps = trackCaps(stream); const poi = "pointsOfInterest" in caps;
    void nativeMetering(s.meterMode).then((native) => {
      if (native) { setMeterOk(true); return; }
      if (!poi) { setMeterOk(false); return; }
      setMeterOk(true);
      void applyAdvanced(stream, s.meterMode === "matrix" ? { exposureMode: "continuous", pointsOfInterest: [] } : { exposureMode: "continuous", pointsOfInterest: [{ x: 0.5, y: 0.5 }] });
    });
  }, [s.meterMode, stream]);
  useEffect(() => { if (s.eyeAF && !s.aiEnabled) void applyAdvanced(stream, { focusMode: "continuous" }); }, [s.eyeAF, s.aiEnabled, stream]);
  const faceBox = useFaceTracking(videoRef, stream, s.eyeAF || s.aiEnabled, s.aiEnabled && s.focusModeAI === "hybrid_nearest_priority");
  const [countdown, setCountdown] = useState(0); const [flash, setFlash] = useState(0); const [photoMsg, setPhotoMsg] = useState("");
  const [lastPhoto, setLastPhoto] = useState<string | null>(null); const intervalRef = useRef<number | null>(null); const [intervalOn, setIntervalOn] = useState(false);
  useEffect(() => () => { if (intervalRef.current) window.clearInterval(intervalRef.current); }, []);
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream, cameraState]);

  useEffect(() => {
    if (!s.recording || !s.recordingStartedAt) { setElapsed(0); return; }
    const update = () => setElapsed((Date.now() - s.recordingStartedAt!) / 1000);
    update(); const timer = window.setInterval(update, 100); return () => window.clearInterval(timer);
  }, [s.recording, s.recordingStartedAt]);

  // Manual parameters from the HUD are pushed to the hardware track.
  useEffect(() => { const [n, d] = s.shutter.split("/").map(Number); if (n && d) applyManual(stream, { exposureMode: "manual", exposureTime: Math.round((n / d) * 10000) }); }, [s.shutter, stream]);
  useEffect(() => { if (s.capture.iso !== null) applyManual(stream, { exposureMode: "manual", iso: s.capture.iso }); }, [s.capture.iso, stream]);
  useEffect(() => { applyManual(stream, s.wbKelvin === null ? { whiteBalanceMode: "continuous" } : { whiteBalanceMode: "manual", colorTemperature: s.wbKelvin }); }, [s.wbKelvin, stream]);

  // Recorder follows global recording state — works for local presses and the director's remote trigger.
  const pipeRef = useRef<{ stop: () => void } | null>(null);
  useEffect(() => {
    mesh.selfRecording = s.recording;
    if (s.recording && stream && typeof MediaRecorder !== "undefined" && recorderRef.current?.state !== "recording" && recorderRef.current?.state !== "paused") {
      chunksRef.current = [];
      const { mode, profile, codec, fps } = s.capture;
      const lapse = mode === "timelapse" ? 1000 : mode === "hyperlapse" ? 200 : 0;
      let source = stream;
      const graded = tuneActive(s) || s.wbKelvin !== null;
      if ((profile !== "standard" || lapse || graded) && videoRef.current) {
        const video = videoRef.current; const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d")!; ctx.filter = [profile === "standard" ? "" : toneFilter(profile), tuneFilter(s), kelvinFilter(s.wbKelvin)].filter(Boolean).join(" ") || "none";
        const draw = () => ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const cs = canvas.captureStream(lapse ? 0 : fps);
        const vt = cs.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
        let raf = 0; let timer = 0;
        if (lapse) timer = window.setInterval(() => { draw(); vt.requestFrame?.(); }, lapse);
        else { const loop = () => { draw(); raf = requestAnimationFrame(loop); }; loop(); }
        source = new MediaStream([...cs.getVideoTracks(), ...(lapse ? [] : stream.getAudioTracks())]);
        pipeRef.current = { stop: () => { cancelAnimationFrame(raf); window.clearInterval(timer); cs.getTracks().forEach((t) => t.stop()); } };
      }
      let gainCtx: AudioContext | null = null;
      if ((s.audioGain !== 1 || s.audioCeiling < 0) && source.getAudioTracks().length) {
        gainCtx = new AudioContext(); const src = gainCtx.createMediaStreamSource(new MediaStream(source.getAudioTracks())); const out = buildLimiter(gainCtx, src, s.audioGain, s.audioCeiling); const dest = gainCtx.createMediaStreamDestination(); out.connect(dest);
        source = new MediaStream([...source.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      }
      const preferred = codecMime(codec);
      const mime = MediaRecorder.isTypeSupported(preferred) ? preferred : MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm";
      const recorder = new MediaRecorder(source, { mimeType: mime });
      const camera = s.activeCamera; const startedAt = Date.now();
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        pipeRef.current?.stop(); pipeRef.current = null; void gainCtx?.close();
        const blob = new Blob(chunksRef.current, { type: mime });
        const request = indexedDB.open("multicam-pov-media", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("clips", { keyPath: "id" });
        request.onsuccess = () => { const tx = request.result.transaction("clips", "readwrite"); tx.objectStore("clips").put({ id: `clip-${Date.now()}`, createdAt: startedAt, camera, mode, profile, playbackRate: lapse ? lapse / (1000 / 30) : 1, blob }); tx.oncomplete = () => window.dispatchEvent(new Event("multicam-clips-changed")); };
      };
      recorder.start(1000); recorderRef.current = recorder;
    } else if (!s.recording && recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  }, [s.recording, stream]);
  useEffect(() => {
    const r = recorderRef.current; if (!r) return;
    if (s.paused && r.state === "recording") r.pause(); else if (!s.paused && r.state === "paused") r.resume();
  }, [s.paused]);

  const wbTint = s.wbKelvin === null ? "" : s.wbKelvin < 5600 ? ` sepia(${((5600 - s.wbKelvin) / 3100) * 0.35})` : ` hue-rotate(${((s.wbKelvin - 5600) / 2400) * -12}deg) saturate(.92)`;
  const previewFilter = [s.capture.profile === "standard" ? "" : toneFilter(s.capture.profile), tuneFilter(s), kelvinFilter(s.wbKelvin)].filter(Boolean).join(" ");
  const notify = (m: string) => { setPhotoMsg(m); window.setTimeout(() => setPhotoMsg(""), 2500); };
  const shootOnce = async () => {
    const v = videoRef.current; if (!v || cameraState !== "live" || !v.videoWidth) { notify("Камера недоступна — снимок невозможен"); return; }
    const sh = s.shoot; const shots: Blob[] = []; let mode = "single";
    if (sh.bracket) {
      mode = "bracket"; const r = capRange(trackCaps(stream), "exposureCompensation");
      for (const ev of [-2, 0, 2]) { if (r) await applyAdvanced(stream, { exposureCompensation: Math.min(r[1], Math.max(r[0], ev)) }); await wait(400); const b = await grabFrames(v, previewFilter, 1, 0); if (b) shots.push(b); }
      if (r) await applyAdvanced(stream, { exposureCompensation: 0 });
    } else if (sh.burst) { mode = "burst"; for (let k = 0; k < 5; k++) { const b = await grabFrames(v, previewFilter, 1, 0); if (b) shots.push(b); await wait(120); } }
    else if (sh.night) { mode = s.aiEnabled ? "night-ml" : "night"; const b = await grabFrames(v, previewFilter, s.aiEnabled ? 12 : 8, s.aiEnabled ? 900 : 600); if (b) shots.push(b); }
    else if (sh.longExp) { mode = "long-exposure"; const b = await grabFrames(v, previewFilter, 40, 2000); if (b) shots.push(b); }
    else { const b = await grabFrames(v, previewFilter, 1, 0); if (b) shots.push(b); }
    if (!shots.length) { notify("Не удалось получить кадр"); return; }
    for (const b of shots) await savePhoto(b, { mode, camera: s.activeCamera, facing: s.facing });
    setFlash((f) => f + 1); setLastPhoto((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(shots[shots.length - 1]!); });
    notify(shots.length > 1 ? `Сохранено ${shots.length} фото` : "Фото сохранено");
  };
  const capturePhoto = async () => {
    if (intervalRef.current) { window.clearInterval(intervalRef.current); intervalRef.current = null; setIntervalOn(false); notify("Интервальная съёмка остановлена"); return; }
    if (countdown) return;
    if (s.shoot.timer) { for (let k = s.shoot.timer; k > 0; k--) { setCountdown(k); await wait(1000); } setCountdown(0); }
    await shootOnce();
    if (s.shoot.interval) { intervalRef.current = window.setInterval(() => void shootOnce(), s.shoot.interval * 1000); setIntervalOn(true); }
  };
  const meterIcon = s.meterMode === "matrix" ? <Grid3x3 className="size-3.5" /> : s.meterMode === "center" ? <Circle className="size-3.5" /> : <Crosshair className="size-3.5" />;
  const meterLabel = s.meterMode === "matrix" ? "Матричный" : s.meterMode === "center" ? "Центральный" : "Точечный";
  const toggleHud = (h: Hud) => setHud((cur) => cur === h ? null : h);
  const gridName = GRIDS.find((g) => g.id === s.grid)?.label ?? "Выкл";

  return <div className={`camera-screen text-foreground ${clean ? "clean" : ""}`}>
    <section className={`absolute inset-0 overflow-hidden bg-viewfinder ${s.recording && !clean ? "tally-frame" : ""}`}>
      {cameraState === "live" ? <video ref={videoRef} autoPlay muted playsInline className={`h-full w-full object-cover ${s.anamorphic === "1.33x" ? "scale-x-[1.33]" : s.anamorphic === "1.55x" ? "scale-x-[1.55]" : ""}`} style={{ filter: `${s.capture.profile === "standard" ? "" : toneFilter(s.capture.profile)} contrast(${1 + s.distortion / 300}) saturate(${s.selectedLut === "Neutral" ? 1 : 1.18})${wbTint} ${tuneFilter(s)}` }} /> : <div className="simulated-feed absolute inset-0"><div className="horizon" /></div>}
      {!clean && cameraState !== "live" && <div className="absolute inset-x-5 top-1/3 z-10 flex flex-col items-center gap-2 rounded-xl bg-background/85 p-4 text-center text-sm backdrop-blur-sm">
        <span>{cameraState === "loading" ? "Подключаю камеру..." : cameraEnabled ? "Камера пока недоступна" : "Проверка завершена. Камера не открывалась."}</span>
        {cameraError && <span className="text-xs text-muted-foreground">{cameraError}</span>}
        {cameraState !== "loading" && <Button type="button" size="sm" onClick={() => { setCameraEnabled(false); window.setTimeout(() => setCameraEnabled(true), 0); }}>Включить камеру</Button>}
      </div>}
      {!clean && <>
        {s.dualCamera && <div className="absolute end-3 top-28 aspect-[3/4] w-[22%] min-w-20 overflow-hidden rounded-md border border-glass bg-viewfinder shadow-2xl"><div className="simulated-feed h-full" /></div>}
        {s.focusPeaking && <div className="focus-peaking pointer-events-none absolute inset-0" />}
        {s.zebras && <div className="zebra-overlay pointer-events-none absolute inset-0 opacity-30" />}
        {s.grid !== "off" && <div className={`pointer-events-none absolute inset-0 grid-overlay grid-${s.grid}`} />}
        {s.falseColor && cameraState === "live" && <FalseColorOverlay videoRef={videoRef} />}
        {faceBox && <div className="pointer-events-none absolute rounded-md border-2 border-tracking transition-all duration-100" style={{ left: `${faceBox.x * 100}%`, top: `${faceBox.y * 100}%`, width: `${faceBox.w * 100}%`, height: `${faceBox.h * 100}%` }}><span className="absolute -top-5 left-0 rounded-sm bg-tracking px-1.5 py-0.5 text-[9px] font-bold text-tracking-foreground">{s.aiEnabled ? "AI · FACE" : "EYE AF"}</span></div>}
        {s.teleprompter && s.teleprompterText.trim() && <div className="teleprompter-mask pointer-events-none absolute inset-x-6 top-[22%] h-32 overflow-hidden text-center font-medium" style={{ fontSize: `${s.teleprompterSize}px` }}><motion.p animate={{ y: [130, -180] }} transition={{ duration: Math.max(4, 60 - s.teleprompterSpeed), repeat: Infinity, ease: "linear" }}>{s.teleprompterText}</motion.p></div>}
      </>}
      {flash > 0 && <div key={flash} className="photo-flash pointer-events-none absolute inset-0 bg-foreground opacity-0" />}
      {countdown > 0 && <div className="pointer-events-none absolute inset-0 grid place-items-center text-7xl font-bold text-foreground drop-shadow-lg">{countdown}</div>}
    </section>

    {/* HUD status bar */}
    <div className="absolute inset-x-2 top-2 z-20 flex items-start gap-1.5">
      {!clean && <div className="scrollbar-none flex min-w-0 flex-1 gap-1 overflow-x-auto">
        <span className="hud-chip"><span className={`h-1.5 w-1.5 rounded-full ${cameraState === "live" ? "bg-status" : "bg-warning"}`} />{cameraState === "live" ? t("live") : t("sim")}</span>
        <button className={`hud-chip ${hud === "shutter" ? "active" : ""}`} onClick={() => toggleHud("shutter")}>{s.shutter}s</button>
        <button className={`hud-chip ${hud === "iso" ? "active" : ""} ${camCaps && !camCaps.iso ? "opacity-40" : ""}`} onClick={() => toggleHud("iso")}>ISO {s.capture.iso ?? "A"}</button>
        <button className={`hud-chip ${hud === "wb" ? "active" : ""}`} onClick={() => toggleHud("wb")}>WB {s.wbKelvin ? `${s.wbKelvin}K` : "A"}</button>
        <button className={`hud-chip ${hud === "grid" ? "active" : ""}`} onClick={() => toggleHud("grid")}>#{gridName}</button>
        <button className={`hud-chip ${meterOk ? "" : "opacity-40"}`} title={meterOk ? `Замер: ${meterLabel}` : "Камера не поддерживает выбор точки замера"} aria-label={`Режим замера: ${meterLabel}`} onClick={() => s.set({ meterMode: s.meterMode === "matrix" ? "center" : s.meterMode === "center" ? "spot" : "matrix" })}>{meterIcon}</button>
      </div>}
      <div className="ms-auto flex shrink-0 items-center gap-1.5"><button aria-label="ИИ-ассистент" aria-pressed={s.aiEnabled} title={s.aiEnabled ? `ИИ включён (${aiEngine === "native" ? "ML Kit" : faceDetectorAvailable() ? "браузер: лица" : "браузер: без детектора лиц"})` : "Включить ИИ"} onClick={() => s.set({ aiEnabled: !s.aiEnabled })} className={`hud-chip shrink-0 ${s.aiEnabled ? "active" : ""}`}><Sparkles className="size-3.5" />AI</button><button aria-label={clean ? "Показать интерфейс" : "Режим чистого кадра"} title="Режим чистого кадра" onClick={() => { setHud(null); setSheet(false); s.set({ cleanFrame: !clean }); }} className={`hud-chip shrink-0 ${clean ? "opacity-60" : ""}`}>{clean ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}</button></div>
    </div>

    {!clean && <div className="absolute start-2 top-11 z-20 flex flex-col items-start gap-1">
      {photoMsg && <span className="glass-panel rounded-full px-2 py-0.5 text-[10px]">{photoMsg}</span>}
    </div>}
    {!clean && s.audioUi && <AudioRail stream={stream} />}

    <AnimatePresence>{hud && !clean && <motion.div key={hud} initial={{ opacity: 0, y: -6, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="glass-panel absolute inset-x-3 top-12 z-30 rounded-xl p-3 text-xs">
      {hud === "shutter" && <MicroSlider label={<LongPressLabel tipKey="shutter" onOpen={setTipKey}>{t("shutter")}</LongPressLabel>} help="shutter" value={`${s.shutter}s`} v={Math.max(0, SHUTTERS.indexOf(s.shutter))} min={0} max={SHUTTERS.length - 1} on={(i) => s.set({ shutter: SHUTTERS[i] ?? "1/48" })} />}
      {hud === "iso" && camCaps && !camCaps.iso && <p className="text-muted-foreground">ISO · {NS}</p>}
      {hud === "wb" && camCaps && !camCaps.whiteBalance && !camCaps.colorTemperature && <p className="text-muted-foreground">Баланс белого · {NS} (только предпросмотр)</p>}
      {hud === "iso" && (!camCaps || camCaps.iso) && <MicroSlider label={<span className="flex items-center gap-1">ISO<HelpDot id="manualIso" /></span>} value={s.capture.iso ?? "Авто"} v={s.capture.iso ?? 100} min={50} max={3200} step={50} on={(iso) => s.set({ capture: { ...s.capture, iso }, isoLock: true })} onAuto={() => s.set({ capture: { ...s.capture, iso: null }, isoLock: false })} />}
      {hud === "wb" && <MicroSlider label={<span className="flex items-center gap-1">Баланс белого<HelpDot id="wbKelvin" /></span>} value={s.wbKelvin ? `${s.wbKelvin}K` : "Авто"} v={s.wbKelvin ?? 5600} min={2500} max={8000} step={100} on={(wbKelvin) => s.set({ wbKelvin, wbLock: true })} onAuto={() => s.set({ wbKelvin: null, wbLock: false })} />}
      {hud === "grid" && <div className="flex items-center gap-1"><HelpDot id="grid" />{GRIDS.map((g) => <button key={g.id} onClick={() => s.set({ grid: g.id })} className={`flex-1 rounded-md px-1 py-1.5 text-[10px] ${s.grid === g.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{g.label}</button>)}</div>}
    </motion.div>}</AnimatePresence>

    {/* Connected secondary cameras only */}
    {!clean && peers.length > 0 && <div className="scrollbar-none absolute inset-x-3 bottom-[15rem] z-10 flex gap-1.5 overflow-x-auto">
      {peers.map((n, i) => <button key={n.id} onClick={() => s.set({ activeCamera: i + 2 })} className={`glass-panel min-w-[7rem] rounded-md px-2 py-1.5 text-start text-[10px] ${s.activeCamera === i + 2 ? "ring-1 ring-primary" : ""}`}><div className="flex items-center justify-between gap-1"><span className="truncate font-semibold">CAM {i + 2} · {n.name}</span><span className={n.recording ? "text-record" : "text-status"}>●</span></div><div className="mt-0.5 flex justify-between gap-1 text-muted-foreground"><span>{n.battery ?? "–"}%</span><span>{n.storageMB ?? "–"} MB</span><span>{n.latency ?? "–"}ms</span></div></button>)}
    </div>}

    {!clean && <div className="absolute inset-x-3 bottom-[12.25rem] z-10"><FocusRail stream={stream} /></div>}

    {/* Settings sheet with accordions */}
    <AnimatePresence>{sheet && !clean && <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: "spring", stiffness: 380, damping: 34 }} className="glass-panel absolute inset-x-2 bottom-2 top-2 z-30 overflow-y-auto overscroll-contain rounded-2xl p-2 text-xs">
      <div className="sticky -top-2 z-10 -mx-2 -mt-2 mb-1 flex items-center justify-between bg-card px-3 py-2"><b className="text-xs">Параметры</b><button aria-label="Закрыть параметры" onClick={() => setSheet(false)} className="rounded-full p-1 text-muted-foreground hover:text-foreground"><X className="size-4" /></button></div>
      <Accordion title="Инструменты кадра" defaultOpen>
        <div className="flex flex-wrap gap-1.5">
          {tools.map(([key, label, Icon]) => <span key={key} className="inline-flex items-center gap-0.5"><ToolButton active={s[key]} onTap={() => s.set({ [key]: !s[key] })} onLong={() => setTipKey(key)}><Icon />{t(label)}</ToolButton><HelpDot id={label} /></span>)}
          <span className="inline-flex items-center gap-0.5"><Button size="sm" variant={s.eyeAF ? "default" : "outline"} title={faceDetectorAvailable() ? "Следящий автофокус по лицу/глазам" : "Следящий AF (детектор лиц в этом браузере недоступен — только AF-C)"} onClick={() => s.set({ eyeAF: !s.eyeAF })}><ScanFace />Трекинг / Глаза</Button><HelpDot id="track" /></span>
          <span className="inline-flex items-center gap-0.5"><Button size="sm" variant={s.falseColor ? "default" : "outline"} onClick={() => s.set({ falseColor: !s.falseColor })}><Palette />Ложные цвета</Button><HelpDot id="falseColor" /></span>
          <span className="inline-flex items-center gap-0.5"><Button size="sm" variant={s.audioUi ? "default" : "outline"} onClick={() => s.set({ audioUi: !s.audioUi })}><AudioLines />Звук‑метр</Button><HelpDot id="audioMeter" /></span>
          <span className="inline-flex items-center gap-0.5"><Button size="sm" variant={s.dualCamera ? "default" : "outline"} onClick={() => s.set({ dualCamera: !s.dualCamera })}><Video />{t("dual")}</Button><HelpDot id="dual" /></span>
        </div>
      </Accordion>
      <Accordion title="Объектив">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5"><LongPressLabel tipKey="anamorphic" onOpen={setTipKey}>{t("anamorphic")}</LongPressLabel><HelpDot id="anamorphic" /></span><div className="flex gap-1">{["off", "1.33x", "1.55x"].map((v) => <button key={v} onClick={() => s.set({ anamorphic: v })} className={`rounded-md px-2 py-1 ${s.anamorphic === v ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{v === "off" ? "Выкл" : v}</button>)}</div></div>
          <MicroSlider label={<LongPressLabel tipKey="distortion" onOpen={setTipKey}>{t("lens")}</LongPressLabel>} help="distortion" value={s.distortion} v={s.distortion} min={-50} max={50} on={(distortion) => s.set({ distortion })} />
          <Button size="sm" variant={s.touchLocked ? "default" : "outline"} className="w-full" onPointerDown={() => s.set({ touchLocked: true })} onPointerUp={() => s.set({ touchLocked: false })} onPointerLeave={() => s.set({ touchLocked: false })}><Maximize /> {t("holdLock")}</Button>
        </div>
      </Accordion>
      <Accordion title="Объективы и зум">
        <LensZoomBlock stream={stream} />
      </Accordion>
      <Accordion title="Цвет и баланс">
        <ColorTuning />
      </Accordion>
      <Accordion title="Режимы съёмки">
        <ShootingModes stream={stream} rawNative={rawNative} />
      </Accordion>
      {s.aiEnabled && <Accordion title="ИИ‑фокус">
        <div className="flex flex-wrap gap-1.5">{([["continuous", "AF‑C"], ["face", "Лицо"], ["hybrid_nearest_priority", "Ближайший объект"]] as const).map(([m, l]) => <Button key={m} size="sm" variant={s.focusModeAI === m ? "default" : "outline"} onClick={() => s.set({ focusModeAI: m })}>{l}</Button>)}</div>
        <p className="mt-2 text-[10px] text-muted-foreground">Движок: {aiEngine === "native" ? "ML Kit (Android)" : faceDetectorAvailable() ? "детектор лиц браузера" : "в этом браузере детектор лиц недоступен — работает только непрерывный AF"}</p>
      </Accordion>}
      <Accordion title={t("teleprompter")}>
        <TeleprompterControls />
      </Accordion>
      <Accordion title="Профессиональная съёмка">
        <CaptureProPanel stream={stream} videoRef={videoRef} />
      </Accordion>
    </motion.div>}</AnimatePresence>

    {/* Bottom control dock */}
    <div className="absolute inset-x-0 bottom-6 z-20 px-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        <div className="mb-4 flex items-center justify-start gap-1.5">{!clean && <>
          <Button size="icon" variant="secondary" aria-label={t("switchCamera")} disabled={s.capMatrix ? !s.capMatrix[s.facing === "rear" ? "front" : "rear"].available : false} onClick={() => s.set({ facing: s.facing === "rear" ? "front" : "rear", capture: { ...s.capture, iso: null, focus: null, exposure: null }, wbKelvin: null })}><Camera /></Button>
          <Button size="icon" variant={sheet ? "default" : "secondary"} aria-label="Параметры" aria-expanded={sheet} onClick={() => { setHud(null); setSheet(!sheet); }}><SlidersHorizontal /></Button>
        </>}</div>
        <div className="flex flex-col items-center gap-2">{!clean && <>
          <div className="flex flex-col items-center"><span className={`glass-panel inline-block rounded-full px-3 py-1 font-mono text-sm font-semibold tabular-nums ${s.recording ? "text-record" : ""}`}>{formatTime(elapsed)}</span><p className="mt-0.5 max-w-[60vw] truncate text-center text-[10px] uppercase text-muted-foreground">{s.role === "slave" ? t("controlledByHost") : s.paused ? "Пауза" : s.recording ? t("recording") : `${t(s.role)} · ${s.sessionCode}`}</p></div>
          <div className="segmented-mini" role="radiogroup" aria-label="Фото или видео">{(["photo", "video"] as const).map((k) => <button key={k} role="radio" aria-checked={s.captureKind === k} disabled={s.recording || intervalOn} onClick={() => s.set({ captureKind: k })} className={s.captureKind === k ? "active" : ""}>{k === "photo" ? "ФОТО" : "ВИДЕО"}</button>)}</div>
        </>}
          <motion.button whileTap={{ scale: .9 }} aria-label={s.recording ? t("stopRec") : t("startRec")} disabled={s.role === "slave"} onClick={() => s.captureKind === "photo" ? void capturePhoto() : s.toggleRecording()} className={`record-shutter ${s.captureKind === "photo" ? "photo" : ""} ${s.recording || intervalOn ? "recording" : ""} ${s.role === "slave" ? "locked" : ""}`}>{s.role === "slave" ? <Lock className="size-6" /> : <span />}</motion.button>
        </div>
        <div className="mb-4 flex justify-end gap-1.5">{!clean && <>
          {s.captureKind === "photo" ? (lastPhoto ? <a href={lastPhoto} download={`multicam-photo-${Date.now()}.jpg`} aria-label="Скачать последнее фото" className="size-9 overflow-hidden rounded-md border border-border"><img src={lastPhoto} alt="Последнее фото" className="h-full w-full object-cover" /></a> : <Button size="icon" variant="secondary" disabled aria-label="Нет фото"><Download /></Button>) :
          <Button size="icon" variant="secondary" disabled={!s.recording} aria-label={s.paused ? "Продолжить" : "Пауза"} onClick={() => s.set({ paused: !s.paused })}>{s.paused ? <Play /> : <Pause />}</Button>}
          <Button size="icon" variant="secondary" aria-label={t("addMarker")} onClick={s.addMarker}><CircleDot /></Button>
        </>}</div>
      </div>
    </div>
    <ProTipPopover tipKey={tipKey} onClose={() => setTipKey(null)} />
  </div>;
}

export function TeleprompterControls() {
  const s = useMulticamStore(); const { t } = useT();
  return <div className="space-y-3 text-xs">
    <label className="flex items-center justify-between"><span>{t("teleprompter")}</span> <Switch checked={s.teleprompter} onCheckedChange={(teleprompter) => s.set({ teleprompter })} /></label>
    <span className="flex items-center gap-1 text-muted-foreground">Текст<HelpDot id="promptText" /></span><textarea value={s.teleprompterText} onChange={(e) => s.set({ teleprompterText: e.target.value })} rows={3} placeholder="Текст для суфлёра" className="w-full resize-none rounded-md border border-border bg-secondary p-2 outline-none" />
    <MicroSlider label={t("scrollSpeed")} help="promptSpeed" value={s.teleprompterSpeed} v={s.teleprompterSpeed} min={10} max={55} on={(teleprompterSpeed) => s.set({ teleprompterSpeed })} />
    <MicroSlider label={t("fontSize")} help="promptSize" value={s.teleprompterSize} v={s.teleprompterSize} min={14} max={48} on={(teleprompterSize) => s.set({ teleprompterSize })} />
  </div>;
}

export function Accordion({ title, help, defaultOpen = false, children }: { title: React.ReactNode; help?: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <div className="border-b border-border/50 last:border-b-0">
    <button aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-1.5 py-2.5 text-xs font-semibold">
      <span className="flex items-center gap-1.5">{title}{help && <HelpDot id={help} />}</span><motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}><ChevronDown className="size-4 text-muted-foreground" /></motion.span>
    </button>
    <AnimatePresence initial={false}>{open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .22, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden"><div className="px-1.5 pb-3">{children}</div></motion.div>}</AnimatePresence>
  </div>;
}

function MicroSlider({ label, help, value, v, min, max, step = 1, on, onAuto }: { label: React.ReactNode; help?: string; value: React.ReactNode; v: number; min: number; max: number; step?: number; on: (v: number) => void; onAuto?: () => void }) {
  return <div><div className="mb-2 flex items-center justify-between gap-2"><span className="flex items-center gap-1">{label}{help && <HelpDot id={help} />}</span><span className="flex items-center gap-2 font-mono text-muted-foreground">{value}{onAuto && <button onClick={onAuto} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-primary">Авто</button>}</span></div><Slider value={[v]} min={min} max={max} step={step} onValueChange={([x = v]) => on(x)} /></div>;
}
function ToolButton({ active, onTap, onLong, children }: { active: boolean; onTap: () => void; onLong: () => void; children: React.ReactNode }) {
  const handlers = useLongPress(onLong, onTap);
  return <Button size="sm" variant={active ? "default" : "outline"} className="select-none [touch-action:manipulation]" {...handlers}>{children}</Button>;
}
function formatTime(seconds: number) { const min = Math.floor(seconds / 60).toString().padStart(2, "0"); const sec = Math.floor(seconds % 60).toString().padStart(2, "0"); const ms = Math.floor(seconds * 10) % 10; return `${min}:${sec}.${ms}`; }
