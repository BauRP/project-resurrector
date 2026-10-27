import { recordModeEvidence } from "@/lib/camera-passport";
import { highSpeedRecordedModeEvidence } from "@/lib/native-video-evidence";
import { buildAnonymousCameraReport } from "@/lib/diagnostic-export";
import { decideStabilizationForRecordedMode } from "@/lib/stabilization-policy";
import { useEffect, useRef, useState } from "react";
import { useMulticamStore } from "@/lib/multicam-store";
import { isNative, MultiCamNative, type NativeCameraProfile, type NativeEncoderSupport } from "@/lib/native";
import { loadModeEvidence, type ModeEvidence } from "@/lib/camera-passport";
import { verifyMode, TEST_MODES } from "@/lib/mode-verification";
import { prepareCameraTestQueue, loadCameraTestQueue, persistCameraTestQueue, updateCameraTestTask, queueSummary, selectQuickCameraTasks, type CameraTestTask } from "@/lib/camera-test-queue";
import { Button } from "@/components/ui/button";
import { captureRealDng } from "@/lib/raw-dng";
import { probeStabilization, type StabilizationProbeResult } from "@/lib/stabilization-probe";
import { verifyDualCameraRecording, type DualCameraEvidence } from "@/lib/dual-camera-verification";
import { diagnosticProbeLimit, checkDiagnosticSafety } from "@/lib/diagnostic-safety";

export function CameraDiagnostics() {
  const recording = useMulticamStore(s => s.recording);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [nativeCameras, setNativeCameras] = useState<NativeCameraProfile[]>([]);
  const [tests, setTests] = useState<ModeEvidence[]>(() => loadModeEvidence());
  const [testQueue, setTestQueue] = useState<CameraTestTask[]>(() => loadCameraTestQueue());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [safetyNotice, setSafetyNotice] = useState("");
  const [error, setError] = useState("");
  const [dualBusy, setDualBusy] = useState(false);
  const [dualMessage, setDualMessage] = useState("");
  const [dualFirst, setDualFirst] = useState("");
  const [dualSecond, setDualSecond] = useState("");
  const [dualEvidence, setDualEvidence] = useState<DualCameraEvidence[]>([]);
  const [encoder, setEncoder] = useState<NativeEncoderSupport | null>(null);
  const [encoderBusy, setEncoderBusy] = useState(false);
  const [highSpeedState, setHighSpeedState] = useState<"idle" | "starting" | "recording" | "stopping">("idle");
  const [highSpeedMessage, setHighSpeedMessage] = useState("");
  const [lastMp4Inspection, setLastMp4Inspection] = useState<import("@/lib/native").NativeMp4Inspection | null>(null);
  const highSpeedSession = useRef(false);
  const [highSpeedCamera, setHighSpeedCamera] = useState("");
  const [highSpeedMode, setHighSpeedMode] = useState("");
  const [availability, setAvailability] = useState<Record<string, boolean>>({});
  const [rawBusy, setRawBusy] = useState(false);
  const [rawMessage, setRawMessage] = useState("");
  const [stabilizationBusy, setStabilizationBusy] = useState(false);
  const [stabilizationResults, setStabilizationResults] = useState<StabilizationProbeResult[]>([]);
  const [stabilizationMessage, setStabilizationMessage] = useState("");
  const job = useRef<AbortController | null>(null);
  const dualJob = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  useEffect(() => { if (recording) job.current?.abort(); }, [recording]);
  useEffect(() => {
    mounted.current = true;
    const refresh = () => {
      void navigator.mediaDevices?.enumerateDevices?.()
        .then(all => { if (mounted.current) setDevices(all.filter(d => d.kind === "videoinput" && !!d.deviceId)); })
        .catch(() => { if (mounted.current) setError("Камеры WebView недоступны"); });
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    let removeAvailability: (() => void) | undefined;
    if (isNative()) {
      void MultiCamNative.addListener("cameraAvailabilityChanged", event => {
        if (mounted.current) {
          setAvailability(previous => ({ ...previous, [event.cameraId]: event.available }));
          refresh();
        }
      }).then(listener => {
        if (!mounted.current) { void listener.remove(); return; }
        removeAvailability = () => { void listener.remove(); };
        void MultiCamNative.startCameraAvailability().catch(() => setError("События доступности Camera2 недоступны"));
      }).catch(() => { if (mounted.current) setError("События доступности Camera2 недоступны"); });
    }
    if (isNative()) void MultiCamNative.getCapabilities()
      .then(result => { if (mounted.current) setNativeCameras(result.cameras); })
      .catch(() => { if (mounted.current) setError("Информация Camera2 недоступна"); });
    return () => {
      mounted.current = false; job.current?.abort(); dualJob.current?.abort();
      if (highSpeedSession.current) {
        highSpeedSession.current = false;
        void MultiCamNative.stopHighSpeedRecording().catch(() => undefined);
      }
      removeAvailability?.();
      if (isNative()) void MultiCamNative.stopCameraAvailability().catch(() => undefined);
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, []);
  const queueIds = devices.map(d => d.deviceId);
  const planned = prepareCameraTestQueue(queueIds, TEST_MODES, testQueue, tests);
  const summary = queueSummary(planned, queueIds);
  const run = async (full: boolean) => {
    if (job.current || running || recording || dualBusy || rawBusy || stabilizationBusy || highSpeedState !== "idle" || !devices.length) return;
    if (full && !window.confirm("Продолжить незавершённые испытания всех камер? Возможны нагрев и расход заряда.")) return;
    const current = new AbortController();
    job.current = current;
    setRunning(true); setError(""); setSafetyNotice("");
    let queue = prepareCameraTestQueue(queueIds, full ? TEST_MODES : TEST_MODES.slice(0, 2), loadCameraTestQueue(), loadModeEvidence());
    const persist = (next: CameraTestTask[]) => {
      queue = next; persistCameraTestQueue(queue);
      if (mounted.current) setTestQueue(queue);
    };
    persist(queue);
    const candidates = queue.filter(task => queueIds.includes(task.cameraId) &&
      (full || TEST_MODES.slice(0, 2).some(mode => mode.width === task.mode.width && mode.height === task.mode.height && mode.fps === task.mode.fps)) &&
      (["pending","retry","deferred"].includes(task.status) || (full && ["error","recorded"].includes(task.status))));
    const eligible = full ? candidates : selectQuickCameraTasks(candidates, 2, queue);
    try {
      let count = 0;
      for (const task of eligible) {
        if (current.signal.aborted) return;
        if (document.hidden || recording) {
          persist(updateCameraTestTask(queue, task.key, "deferred", "Проверка отложена: запись или приложение в фоне"));
          setProgress("Диагностика приостановлена: приложение неактивно или началась запись");
          return;
        }
        const safe = await checkDiagnosticSafety(full);
        if (current.signal.aborted) return;
        if (!safe.proceed) {
          persist(updateCameraTestTask(queue, task.key, "deferred", safe.reason));
          setSafetyNotice("Диагностика отложена: " + safe.reason);
          return;
        }
        if (safe.thermal === "unknown" || safe.battery === "unknown" || safe.storage === "unknown") setSafetyNotice(safe.reason);
        if (count >= diagnosticProbeLimit(safe, eligible.length)) {
          setProgress("Оставшиеся режимы отложены: состояние устройства не полностью известно");
          return;
        }
         const name = devices.find(d => d.deviceId === task.cameraId)?.label || "Камера";
        setProgress("Испытание " + (++count) + "/" + eligible.length + " · " + name + " · " +
          task.mode.width + "×" + task.mode.height + " " + task.mode.fps + " FPS");
        persist(updateCameraTestTask(queue, task.key, "running", "Идёт реальная видеопроба"));
        const evidence = await verifyMode(task.cameraId, task.mode, current.signal);
        if (current.signal.aborted) {
          persist(updateCameraTestTask(queue, task.key, "deferred", "Прервано пользователем"));
          return;
        }
        const status = evidence.state === "verified" ? "verified" :
          evidence.state === "recorded" ? "recorded" :
          evidence.state === "unknown" || evidence.state === "applied" ? "deferred" : "error";
        persist(updateCameraTestTask(queue, task.key, status, evidence.message || "Проверка завершена"));
        if (mounted.current) setTests(loadModeEvidence());
      }
    } catch (error) {
      if (mounted.current) setError("Ошибка очереди диагностики: " + String(error));
    } finally {
      if (mounted.current) { setRunning(false); setProgress(current.signal.aborted ? "Проверка приостановлена" : "Очередь обработана"); }
      if (job.current === current) job.current = null;
    }
  };
  const highSpeedOptions = nativeCameras.flatMap(cam => cam.highSpeed.flatMap(mode =>
    mode.fps.filter(fps => fps >= 120).map(fps => ({
      key: cam.cameraId + "|" + mode.size + "|" + fps,
      cameraId: cam.cameraId, size: mode.size, fps,
    }))
  ));
  const beginHighSpeed = async () => {
    const option = highSpeedOptions.find(x => x.key === highSpeedMode);
    if (!option || running || recording || highSpeedState !== "idle") return;
    if (!window.confirm("Открыть настоящую Camera2 high-speed запись " + option.size + "@" + option.fps + " на камере " + option.cameraId + "? Экран предпросмотра WebView отключён в этой сессии. Устройство может ограничивать такой режим.")) return;
    const [width, height] = option.size.split("x").map(Number);
    if (!width || !height) { setError("Некорректный размер native high-speed"); return; }
    setHighSpeedState("starting"); setHighSpeedMessage("Запуск Camera2 high-speed…");
    try {
      await MultiCamNative.startHighSpeedRecording({ cameraId: option.cameraId, width, height, fps: option.fps });
      highSpeedSession.current = true;
      if (mounted.current) { setHighSpeedCamera(option.cameraId); setHighSpeedState("recording"); setHighSpeedMessage("Запись началась, остановите её вручную"); }
      else { highSpeedSession.current = false; void MultiCamNative.stopHighSpeedRecording().catch(() => undefined); }
    } catch (e) {
      if (mounted.current) { setHighSpeedState("idle"); setHighSpeedMessage("Ошибка запуска: " + String(e)); }
    }
  };
  const finishHighSpeed = async () => {
    if (highSpeedState !== "recording") return;
    setHighSpeedState("stopping");
    highSpeedSession.current = false;
    try {
      const file = await MultiCamNative.stopHighSpeedRecording();
      if (mounted.current) setLastMp4Inspection(file.inspection ?? null);
      const selectedMode = highSpeedOptions.find(x => x.cameraId === highSpeedCamera && x.key === highSpeedMode);
      if (selectedMode) {
        const [requestedWidth,requestedHeight] = selectedMode.size.split("x").map(Number);
        const evidence = highSpeedRecordedModeEvidence(selectedMode.cameraId,
          { width:requestedWidth ?? 0, height:requestedHeight ?? 0, fps:selectedMode.fps },
          {bytes:file.bytes,...(file.inspection ? {inspection:file.inspection} : {}),
            ...(file.inspectionError ? {inspectionError:file.inspectionError} : {})},Date.now());
        recordModeEvidence(evidence);
        if (mounted.current) setTests(loadModeEvidence());
      }
      if (mounted.current) {
        const parsed = file.inspection;
        setHighSpeedMessage("Сохранён Camera2 MP4: " + file.bytes + " байт. " +
          (parsed ? "Видеодорожка: " + (parsed.width ?? "?") + "×" + (parsed.height ?? "?") +
            ", " + parsed.samplesRead + " сэмплов, " +
            (parsed.estimatedSampleFps ?? "не удалось оценить") + " FPS по начальным меткам MP4. " +
            "К концу файла прочитано " + (parsed.tailSamplesRead ?? 0) + " сэмплов; FPS в конце: " +
            (parsed.tailEstimatedSampleFps ?? "неизвестно") + ". " +
            "Близость к заявленному концу: " + (parsed.tailSampleNearDeclaredEnd === true ? "есть выборка" : "не подтверждена") +
            ". Поворот MP4: " + (parsed.rotationDegrees ?? "неизвестно") + "°. " :
            "Анализ видеодорожки не прошёл: " + (file.inspectionError ?? "неизвестно") + ". ") +
          "Это не подтверждает FPS сенсора, HDR, стабилизацию или все кадры. Путь: " + file.path);
      }
    } catch (e) {
      if (mounted.current) setHighSpeedMessage("Ошибка сохранения: " + String(e));
    } finally {
      if (mounted.current) { setHighSpeedState("idle"); setHighSpeedCamera(""); }
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
  const testRaw = async (cameraId: string) => {
    if (rawBusy || recording || running || highSpeedState !== "idle") return;
    if (!window.confirm("Сделать настоящий RAW/DNG кадр через Camera2? Камера должна быть свободна; пробный файл сохранится во внутренней папке Android.")) return;
    setRawBusy(true); setRawMessage("Открывается Camera2 RAW_SENSOR…");
    try {
      const result = await captureRealDng(cameraId);
      if (mounted.current) setRawMessage("Настоящий DNG сохранён: " + result.width + "×" + result.height + ", " + result.bytes + " байт. Путь: " + result.path);
    } catch (e) {
      if (mounted.current) setRawMessage("RAW не подтверждён: " + String(e));
    } finally {
      if (mounted.current) setRawBusy(false);
    }
  };
  const checkStabilization = async (cameraId: string) => {
    if (stabilizationBusy || rawBusy || recording || running || highSpeedState !== "idle") return;
    if (!window.confirm("Проверить реальную EIS/OIS через Camera2 CaptureResult на " + cameraId + " в тестовой YUV 1280×720 сессии? Файл не записывается, WebView-камера должна быть свободна.")) return;
    setStabilizationBusy(true);
    setStabilizationMessage("Открытие Camera2 для проверки стабилизации…");
    try {
      const result = await probeStabilization(cameraId, 1280, 720, 30);
      if (mounted.current) {
        setStabilizationResults(previous => [...previous.filter(p => p.cameraId !== cameraId), result]);
        setStabilizationMessage("CAM " + cameraId + ": " + result.message);
      }
    } catch (e) {
      if (mounted.current) setStabilizationMessage("Camera2 стабилизация не подтверждена: " + String(e));
    } finally { if (mounted.current) setStabilizationBusy(false); }
  };
  const testDual = async () => {
    if (dualBusy || recording || running || rawBusy || stabilizationBusy || highSpeedState !== "idle") return;
    if (!dualFirst || !dualSecond || dualFirst === dualSecond) {
      setDualMessage("Выберите две разные камеры WebView"); return;
    }
    if (!window.confirm("Проверить одновременную короткую запись ДВУХ камер и двух кодировщиков? Тест может нагреть телефон. Оба файла сохраняются в медиатеку только при общем успехе.")) return;
    const test = new AbortController(); dualJob.current = test;
    setDualBusy(true); setDualMessage("Проверяю две независимые камеры и два видеокодировщика…");
    try {
      const result = await verifyDualCameraRecording(dualFirst, dualSecond, test.signal);
      if (mounted.current) {
        setDualEvidence(prev => [...prev, result]);
        setDualMessage("Два видео сохранены: " + result.first.bytes + " и " + result.second.bytes +
          " байт. Разница старта: " + result.startedSkewMs + " мс. Синхронизация кадров не подтверждена.");
        window.dispatchEvent(new Event("multicam-clips-changed"));
      }
    } catch (error) {
      if (mounted.current) setDualMessage("Двухкамерная запись не подтверждена: " + String(error));
    } finally {
      if (mounted.current) setDualBusy(false);
      if (dualJob.current === test) dualJob.current = null;
    }
  };
  const download = () => {
    const report = buildAnonymousCameraReport({
      checkedAt: new Date().toISOString(),
      nativeCameras, modes: tests, mp4: lastMp4Inspection,
    });
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "multicam-camera-passport-anonymous.json"; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="rounded-lg border border-border bg-card p-4">
    <h2 className="mb-2 text-sm font-semibold">Диагностика всех доступных камер</h2>
    <p className="mb-3 text-xs text-muted-foreground">Камеры испытываются по очереди. «Записано» означает настоящий непустой видеообразец, но не проверенный FPS готового файла. EIS/OIS показываются как заявленные или неизвестные.</p>
    <p className="mb-2 text-xs text-muted-foreground">Очередь режимов: полностью подтверждено {summary.verified}/{summary.total}, файлы без проверки FPS {summary.recorded}, ожидают {summary.pending}, ошибки {summary.failed}, отложено {summary.deferred}. Успешный запуск интерфейса не равен полной диагностике.</p>
    <div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={running || recording || !devices.length} onClick={() => void run(false)}>Быстрая проверка</Button>
      <Button size="sm" variant="secondary" disabled={running || recording || !devices.length} onClick={() => void run(true)}>Расширенная проверка</Button>
      <Button size="sm" variant="outline" disabled={!running} onClick={() => job.current?.abort()}>Остановить</Button>
      <Button size="sm" variant="outline" disabled={!nativeCameras.length && !tests.length && !encoder} onClick={download}>Скачать паспорт</Button>
      {isNative() && <Button size="sm" variant="secondary" disabled={encoderBusy || running || recording} onClick={() => void checkEncoder()}>{encoderBusy ? "Проверяю…" : "Кодировщики 1080p30"}</Button>}
    </div>
    {isNative() && <div className="mt-3 rounded-md border border-border p-2 text-xs">
      <p className="font-semibold">Нативная Camera2 Slow-mo · реальные FPS</p>
      <p className="mt-1 text-muted-foreground">Доступны только заявленные постоянные высокоскоростные режимы. Проверка запускает настоящий MediaRecorder Camera2. Аудио и предпросмотр могут быть недоступны; результат записывается во внутреннюю папку приложения.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select className="min-w-0 max-w-full rounded-md border border-border bg-secondary p-2" aria-label="Выбрать Camera2 high-speed режим" value={highSpeedMode} onChange={e => setHighSpeedMode(e.target.value)} disabled={highSpeedState !== "idle"}>
          <option value="">Выберите камеру, разрешение и FPS</option>
          {highSpeedOptions.map(x => <option key={x.key} value={x.key}>CAM {x.cameraId} · {x.size} · {x.fps} FPS</option>)}
        </select>
        <Button size="sm" disabled={!highSpeedMode || running || recording || highSpeedState !== "idle"} onClick={() => void beginHighSpeed()}>Начать Slow-mo</Button>
        <Button size="sm" variant="secondary" disabled={highSpeedState !== "recording"} onClick={() => void finishHighSpeed()}>Остановить Slow-mo</Button>
      </div>
      {highSpeedState !== "idle" && <p className="mt-1">Состояние: {highSpeedState} · CAM {highSpeedCamera || "…"}</p>}
      {highSpeedMessage && <p role="status" className="mt-1 break-words text-muted-foreground">{highSpeedMessage}</p>}
    </div>}
    <div className="mt-3 rounded-md border border-border p-2 text-xs">
      <p className="font-semibold">Две камеры одновременно · пробная запись</p>
      <p className="mt-1 text-muted-foreground">Выберите два разных устройства WebView. Проверка открывает два реальных потока, записывает два коротких видео и сохраняет их вместе. Это НЕ подтверждает постоянную синхронизацию или работу Camera2-мультикамеры.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <select aria-label="Первая камера" value={dualFirst} onChange={e => setDualFirst(e.target.value)} disabled={dualBusy} className="min-w-0 rounded-md border border-border bg-secondary p-2">
          <option value="">Камера №1</option>{devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Камера " + (i+1)}</option>)}
        </select>
        <select aria-label="Вторая камера" value={dualSecond} onChange={e => setDualSecond(e.target.value)} disabled={dualBusy} className="min-w-0 rounded-md border border-border bg-secondary p-2">
          <option value="">Камера №2</option>{devices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Камера " + (i+1)}</option>)}
        </select>
        <Button size="sm" disabled={dualBusy || devices.length < 2 || recording || running || rawBusy || stabilizationBusy || highSpeedState !== "idle"} onClick={() => void testDual()}>Проверить две записи</Button>
        <Button size="sm" variant="outline" disabled={!dualBusy} onClick={() => dualJob.current?.abort()}>Остановить</Button>
      </div>
      {dualMessage && <p role="status" className="mt-2 break-words">{dualMessage}</p>}
    </div>
    {recording && <p className="mt-2 text-xs text-warning">Во время записи диагностика недоступна</p>}
    {!!safetyNotice && <p className="mt-2 text-xs text-warning" role="status">{safetyNotice}</p>}
    {!!progress && <p className="mt-2 text-xs" role="status">{progress}</p>}
    {!!error && <p className="mt-2 text-xs text-warning" role="alert">{error}</p>}
    <div className="mt-3 space-y-2">
      <p className="text-xs font-semibold">WebView: {devices.length} камер</p>
      {devices.map((d, i) => <div key={d.deviceId} className="rounded-md border border-border p-2 text-xs">
        <span>{d.label || "Камера " + (i + 1)}</span>
        <span className="ms-2 text-muted-foreground">{tests.filter(t => t.cameraId === d.deviceId && t.state === "verified").length} подтверждённых режимов · {tests.filter(t => t.cameraId === d.deviceId && t.state === "recorded").length} файлов без полного подтверждения</span>
      </div>)}
      <p className="pt-2 text-xs font-semibold">Camera2: {nativeCameras.length} логических камер</p>
      {nativeCameras.map(c => <div key={c.cameraId} className="rounded-md border border-border p-2 text-xs">
        <p className="font-medium">ID {c.cameraId} · {c.facing} · {availability[c.cameraId] === true ? "сейчас доступна" : availability[c.cameraId] === false ? "сейчас занята или недоступна" : "текущая доступность неизвестна"}</p>
        <p className="text-muted-foreground">Физические ID: {c.physicalCameraIds?.join(", ") || "не раскрыты"}</p>
        <p className="text-muted-foreground">EIS: {c.eisDeclared ? "заявлена" : "состояние неизвестно"} · OIS: {c.oisDeclared ? "заявлена" : "состояние неизвестно"}</p>
        <p className="text-muted-foreground">Разрешения: {c.sizes.length}; заявленные высокоскоростные режимы: {c.highSpeed.length}</p>
        <p className="text-muted-foreground">HDR Camera2: {c.dynamicRangeApiAvailable ? (c.dynamicRangeProfiles?.map(p => p.name).join(", ") || "нет раскрытых профилей") : "API недоступен"} · 10-бит: {c.tenBitOutputDeclared ? "заявлено" : "не подтверждено"}</p>
        <p className="text-muted-foreground">HDR-файл, редактор и экспорт не проверены. Цветовые фильтры не считаются аппаратным HDR/LOG.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {c.raw && <Button size="sm" variant="outline" disabled={rawBusy || stabilizationBusy || recording || running || highSpeedState !== "idle"} onClick={() => void testRaw(c.cameraId)}>Снять настоящий DNG · CAM {c.cameraId}</Button>}
          <Button size="sm" variant="outline" disabled={stabilizationBusy || rawBusy || recording || running || highSpeedState !== "idle"} onClick={() => void checkStabilization(c.cameraId)}>Проверить OIS/EIS · CAM {c.cameraId}</Button>
        </div>
        {stabilizationResults.filter(x => x.cameraId === c.cameraId).map(x =>
          <p key={x.cameraId} className="mt-1 text-muted-foreground">{x.selected}: {x.state === "capture-result-confirmed" ? "подтверждено CaptureResult тестовой сессии" : x.state === "declared-unavailable" ? "не объявлено Camera2" : "состояние неизвестно / не подтверждено"} · {x.framesObserved ?? 0} кадров · файл не проверялся. {decideStabilizationForRecordedMode(x,{cameraId:c.cameraId,width:1280,height:720,fps:30}).message}</p>
        )}
      </div>)}
      {stabilizationMessage && <p role="status" className="break-words rounded-md border border-border p-2 text-xs">{stabilizationMessage}</p>}
      {rawMessage && <p role="status" className="break-words rounded-md border border-border p-2 text-xs">{rawMessage}</p>}
      {encoder && <div className="rounded-md border border-border p-2 text-xs">
        <p className="font-semibold">MediaCodec 1920×1080/30 FPS (заявленные ограничения)</p>
        {encoder.encoders.map((item, i) => <p key={i} className="mt-1 text-muted-foreground">
          {item.encoderName} · {item.mime} · {item.declaredSizeRate ? "размер и частота заявлены" : "не заявлены"} · аппаратный: {item.hardwareAccelerated} · HEVC 10-bit: {item.hevcTenBitCandidate ? "профиль заявлен" : "не заявлен"} · HDR10: {item.hdr10ProfileDeclared ? "профиль заявлен" : "не заявлен"}
        </p>)}
      </div>}
      {!!tests.length && <div className="max-h-56 overflow-y-auto rounded-md border border-border p-2">
        {tests.slice(-25).reverse().map((t,i) => <p key={i} className="border-b border-border py-1 text-[11px]">
          {t.requested.width}×{t.requested.height} · {t.requested.fps} FPS · <strong>{t.state === "verified" ? "видеофайл читается" : t.state === "recorded" ? "файл есть, режим не подтверждён" : t.state === "rejected" ? "не удалось" : t.state}</strong>
          {t.message ? " · " + t.message : ""}
        </p>)}
      </div>}
    </div>
  </section>;
}
