import { useEffect, useRef, useState } from "react";
import { useMulticamStore } from "@/lib/multicam-store";
import { isNative, MultiCamNative, type NativeCameraProfile, type NativeEncoderSupport } from "@/lib/native";
import { loadModeEvidence, type ModeEvidence } from "@/lib/camera-passport";
import { verifyMode, TEST_MODES } from "@/lib/mode-verification";
import { Button } from "@/components/ui/button";

export function CameraDiagnostics() {
  const recording = useMulticamStore(s => s.recording);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [nativeCameras, setNativeCameras] = useState<NativeCameraProfile[]>([]);
  const [tests, setTests] = useState<ModeEvidence[]>(() => loadModeEvidence());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [encoder, setEncoder] = useState<NativeEncoderSupport | null>(null);
  const [encoderBusy, setEncoderBusy] = useState(false);
  const job = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      void navigator.mediaDevices?.enumerateDevices?.()
        .then(all => { if (mounted.current) setDevices(all.filter(d => d.kind === "videoinput" && !!d.deviceId)); })
        .catch(() => { if (mounted.current) setError("Камеры WebView недоступны"); });
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    if (isNative()) void MultiCamNative.getCapabilities()
      .then(result => { if (mounted.current) setNativeCameras(result.cameras); })
      .catch(() => { if (mounted.current) setError("Информация Camera2 недоступна"); });
    return () => {
      mounted.current = false; job.current?.abort();
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, []);
  const run = async (full: boolean) => {
    if (running || recording || !devices.length) return;
    if (full && !window.confirm("Будут последовательно созданы короткие пробные видео на всех доступных камерах. Возможны нагрев и расход заряда. Продолжить?")) return;
    const current = new AbortController();
    job.current = current;
    setRunning(true); setError("");
    const modes = full ? TEST_MODES : TEST_MODES.slice(0, 2);
    const total = devices.length * modes.length;
    try {
      let count = 0;
      for (const device of devices) for (const mode of modes) {
        if (current.signal.aborted) return;
        setProgress("Проверка " + (++count) + "/" + total + " · " +
          (device.label || "Камера") + " · " + mode.width + "×" + mode.height + " " + mode.fps + " FPS");
        await verifyMode(device.deviceId, mode, current.signal);
        if (mounted.current) setTests(loadModeEvidence());
      }
    } finally {
      if (mounted.current) { setRunning(false); setProgress(current.signal.aborted ? "Отменено" : "Проверка завершена"); }
      if (job.current === current) job.current = null;
    }
  };
  const checkEncoder = async () => {
    if (!isNative() || encoderBusy) return;
    setEncoderBusy(true); setError("");
    try {
      const result = await MultiCamNative.getEncoderSupport({ width: 1920, height: 1080, fps: 30 });
      if (mounted.current) setEncoder(result);
    } catch (e) {
      if (mounted.current) setError("Не удалось запросить кодировщики: " + String(e));
    } finally { if (mounted.current) setEncoderBusy(false); }
  };
  const download = () => {
    const report = {
      checkedAt: new Date().toISOString(),
      warning: "Camera2 physical IDs and WebView device IDs must not be equated. EIS/OIS declarations are unverified for particular modes.",
      camerasDeclaredByCamera2: nativeCameras,
      cameraModeEvidence: tests,
      encoderEvidence: encoder,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "multicam-camera-passport.json"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="rounded-lg border border-border bg-card p-4">
    <h2 className="mb-2 text-sm font-semibold">Диагностика всех доступных камер</h2>
    <p className="mb-3 text-xs text-muted-foreground">Камеры испытываются по очереди. «Записано» означает настоящий непустой видеообразец, но не проверенный FPS готового файла. EIS/OIS показываются как заявленные или неизвестные.</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={running || recording || !devices.length} onClick={() => void run(false)}>Быстрая проверка</Button>
      <Button size="sm" variant="secondary" disabled={running || recording || !devices.length} onClick={() => void run(true)}>Расширенная проверка</Button>
      <Button size="sm" variant="outline" disabled={!running} onClick={() => job.current?.abort()}>Остановить</Button>
      <Button size="sm" variant="outline" disabled={!nativeCameras.length && !tests.length && !encoder} onClick={download}>Скачать паспорт</Button>
      {isNative() && <Button size="sm" variant="secondary" disabled={encoderBusy || running || recording} onClick={() => void checkEncoder()}>{encoderBusy ? "Проверяю…" : "Кодировщики 1080p30"}</Button>}
    </div>
    {recording && <p className="mt-2 text-xs text-warning">Во время записи диагностика недоступна</p>}
    {!!progress && <p className="mt-2 text-xs" role="status">{progress}</p>}
    {!!error && <p className="mt-2 text-xs text-warning" role="alert">{error}</p>}
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold">WebView: {devices.length} камер</p>
      {devices.map((d, i) => <div key={d.deviceId} className="rounded-md border border-border p-2 text-xs">
        <span>{d.label || "Камера " + (i + 1)}</span>
        <span className="ms-2 text-muted-foreground">{tests.filter(t => t.cameraId === d.deviceId && (t.state === "recorded" || t.state === "verified")).length} проверенных файлов</span>
      </div>)}
      <p className="pt-2 text-xs font-semibold">Camera2: {nativeCameras.length} логических камер</p>
      {nativeCameras.map(c => <div key={c.cameraId} className="rounded-md border border-border p-2 text-xs">
        <p className="font-medium">ID {c.cameraId} · {c.facing}</p>
        <p className="text-muted-foreground">Физические ID: {c.physicalCameraIds?.join(", ") || "не раскрыты"}</p>
        <p className="text-muted-foreground">EIS: {c.eisDeclared ? "заявлена" : "состояние неизвестно"} · OIS: {c.oisDeclared ? "заявлена" : "состояние неизвестно"}</p>
        <p className="text-muted-foreground">Разрешения: {c.sizes.length}; заявленные высокоскоростные режимы: {c.highSpeed.length}</p>
      </div>)}
      {encoder && <div className="rounded-md border border-border p-2 text-xs">
        <p className="font-semibold">MediaCodec 1920×1080/30 FPS (заявленные ограничения)</p>
        {encoder.encoders.map((item, i) => <p key={i} className="mt-1 text-muted-foreground">
          {item.encoderName} · {item.mime} · {item.declaredSizeRate ? "размер и частота заявлены" : "не заявлены"} · аппаратный: {item.hardwareAccelerated}
        </p>)}
      </div>}
      {!!tests.length && <div className="max-h-56 overflow-y-auto rounded-md border border-border p-2">
        {tests.slice(-25).reverse().map((t,i) => <p key={i} className="border-b border-border py-1 text-[11px]">
          {t.requested.width}×{t.requested.height} · {t.requested.fps} FPS · <strong>{t.state === "verified" ? "видеофайл читается" : t.state === "recorded" ? "видео записано" : t.state === "rejected" ? "не удалось" : t.state}</strong>
          {t.message ? " · " + t.message : ""}
        </p>)}
      </div>}
    </div>
  </section>;
}
