import { useEffect, useRef, useState } from "react";
import { bounded } from "@/lib/async";

export interface CameraOption {
  deviceId: string;
  label: string;
}
/** Do not equate two devices with two independently controllable physical lenses. */
export function distinctSecondaryCameras(devices: readonly CameraOption[], primaryId: string): CameraOption[] {
  if (!primaryId) return [];
  const seen = new Set<string>();
  return devices.filter(device => {
    if (!device.deviceId || device.deviceId === primaryId || seen.has(device.deviceId)) return false;
    seen.add(device.deviceId);
    return true;
  });
}
const release = (stream: MediaStream) => stream.getTracks().forEach(track => track.stop());

/**
 * Actual *live* secondary preview, not a dummy PiP. Camera permission and
 * independent concurrent openability must be confirmed at runtime.
 * Recording is intentionally blocked while this preview is enabled because
 * the current main recorder encodes only one camera.
 */
export function DualCameraPreview({ primaryStream, onSecondaryStream, recording }: { primaryStream: MediaStream | null; onSecondaryStream: (stream: MediaStream | null) => void; recording: boolean }) {
  const mainTrack = primaryStream?.getVideoTracks()[0] ?? null;
  const primaryId = mainTrack?.getSettings().deviceId ?? "";
  const [devices, setDevices] = useState<CameraOption[]>([]);
  const [selected, setSelected] = useState("");
  const [secondStream, setSecondStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<"select" | "opening" | "live" | "unavailable">("select");
  const [details, setDetails] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const secondaryChanged = useRef(onSecondaryStream); secondaryChanged.current = onSecondaryStream;
  useEffect(() => { secondaryChanged.current(secondStream); return () => secondaryChanged.current(null); }, [secondStream]);
  const candidates = distinctSecondaryCameras(devices, primaryId);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      void navigator.mediaDevices?.enumerateDevices?.().then(list => {
        if (!mounted) return;
        setDevices(list.filter(x => x.kind === "videoinput").map(x => ({ deviceId: x.deviceId, label: x.label })));
      }).catch(() => { if (mounted) setDetails("WebView не раскрывает дополнительные устройства"); });
    };
    refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => { mounted = false; navigator.mediaDevices?.removeEventListener?.("devicechange", refresh); };
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (!candidates.some(camera => camera.deviceId === selected)) setSelected("");
  }, [selected, primaryId, devices]);

  useEffect(() => {
    let active = true;
    setSecondStream(null);
    setStatus(selected ? "opening" : "select");
    setDetails("");
    if (!selected || !primaryId || !mainTrack || mainTrack.readyState !== "live") return () => { active = false; };
    let open: MediaStream | null = null;
    const onMainEnded = () => {
      if (!active) return;
      setStatus("unavailable");
      setDetails("Первая камера остановилась при открытии второй. Одновременный предпросмотр не подтверждён.");
      if (open && !recording) release(open);
      open = null;
      setSecondStream(null);
    };
    mainTrack.addEventListener("ended", onMainEnded);
    void bounded(navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: selected }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
      audio: false,
    }), 7000, "Вторая камера", release).then(next => {
      if (!active) { release(next); return; }
      const secondTrack = next.getVideoTracks()[0];
      const actualId = secondTrack?.getSettings().deviceId;
      if (!secondTrack || secondTrack.readyState !== "live" ||
        mainTrack.readyState !== "live" || (actualId && actualId === primaryId)) {
        release(next);
        setStatus("unavailable");
        setDetails("Android/WebView не предоставил два независимых живых видеопотока");
        return;
      }
      open = next;
      setSecondStream(next);
      setStatus("live");
    }).catch(error => {
      if (!active) return;
      setStatus("unavailable");
      setDetails("Вторая камера не открылась: " + (error instanceof Error ? error.message : String(error)));
    });
    return () => {
      active = false;
      mainTrack.removeEventListener("ended", onMainEnded);
      if (open) release(open);
    };
  }, [selected, primaryId, mainTrack]);

  useEffect(() => {
    const player = videoRef.current;
    if (!player || !secondStream) return;
    player.srcObject = secondStream;
    void player.play().catch(() => {
      setStatus("unavailable");
      setDetails("Второй видеопоток открыт, но WebView запретил воспроизведение");
    });
    return () => { if (player.srcObject === secondStream) player.srcObject = null; };
  }, [secondStream]);

  return <div className="absolute end-2 top-16 z-10 w-[min(43%,220px)] rounded-lg border border-border bg-card p-2 text-foreground shadow-lg">
    <p className="mb-1 text-[10px] font-semibold">Вторая камера · живой предпросмотр</p>
    <select className="mb-1 w-full min-w-0 rounded-md border border-border bg-secondary p-1 text-[10px]" aria-label="Выбрать вторую камеру" value={selected} disabled={recording} onChange={event => setSelected(event.target.value)}>
      <option value="">Выбрать камеру</option>
      {candidates.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || "Камера " + (index + 2)}</option>)}
    </select>
    {!primaryId && <p className="text-[10px] text-muted-foreground">Первая камера не предоставила ID, выбор второй пока невозможен.</p>}
    {secondStream && status === "live" ?
      <video ref={videoRef} muted autoPlay playsInline aria-label="Живой видеопоток второй камеры" className="aspect-[4/3] w-full rounded-md bg-black object-cover"/> :
      <div className="flex min-h-20 items-center justify-center rounded-md bg-secondary p-2 text-center text-[10px] text-muted-foreground" role="status">{status === "opening" ? "Открытие второй камеры…" : details || "Выберите независимую камеру"}</div>}
    <p className="mt-1 text-[10px] text-muted-foreground">{recording ? "Идёт запись двух отдельных файлов; точная синхронизация не подтверждена." : "В режиме Видео кнопка записи сохраняет две независимые дорожки при успешном открытии двух камер."}</p>
    {details && status === "unavailable" && <p className="mt-1 break-words text-[10px] text-warning" role="alert">{details}</p>}
  </div>;
}
