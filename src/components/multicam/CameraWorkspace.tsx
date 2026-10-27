import { useCallback, useEffect, useState } from "react";
import { useCameraStore } from "@/lib/camera-store";
import { isNative } from "@/lib/native";
import { nativeCapture, nativeRecorderOwnsCamera } from "@/lib/native-capture";
import { Button } from "@/components/ui/button";
import { CameraTab } from "./CameraTab";
import { NativeRecordingPanel } from "./NativeRecordingPanel";

type Mode = "web" | "native";
const PREF = "multicam-user-camera-mode-v1";

/** Switching mode actually unmounts WebCameraTab and releases its MediaStream.
 * Recording never changes owner on a responsive layout breakpoint. */
export function CameraWorkspace() {
  const recording = useCameraStore(s => s.recording);
  const phase = useCameraStore(s => s.recordingPhase);
  const [mode, setMode] = useState<Mode | null>(isNative() ? null : "web");
  const [notice, setNotice] = useState("");
  const [switching, setSwitching] = useState(false);
  const blocked = recording || ["starting","recording","stopping","saving"].includes(phase);

  useEffect(() => {
    if (!isNative()) return;
    let live = true;
    void nativeCapture.status().then(status => {
      if (!live) return;
      let preference:Mode = "web";
      try { if (localStorage.getItem(PREF) === "native") preference = "native"; }
      catch { /* private storage unavailable */ }
      // A surviving Android service must always keep ownership after WebView
      // Activity recreation. Never reopen getUserMedia before checking it.
      setMode(nativeRecorderOwnsCamera(status.state) ? "native" : preference);
    }).catch(() => {
      if (live) {
        // Fail closed: a service whose state is unknown may own the camera.
        setMode("native");
        setNotice("Состояние нативной камеры неизвестно; откройте нативный режим для проверки.");
      }
    });
    return () => { live = false; };
  }, []);

  const switchTo = useCallback(async (next:Mode) => {
    if (mode === next || switching || blocked) return;
    setSwitching(true);
    try {
      if (next === "web") {
        const status = await nativeCapture.status();
        if (nativeRecorderOwnsCamera(status.state))
          throw Error("Нативная запись ещё работает. Остановите её перед открытием обычного предпросмотра.");
      }
      setNotice("");
      setMode(next);
      try { localStorage.setItem(PREF, next); } catch { /* usable without storage */ }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Камера ещё занята");
    } finally { setSwitching(false); }
  }, [mode,switching,blocked]);

  if (mode === null) return <div role="status" className="flex min-h-[45vh] items-center justify-center p-4 text-center text-sm">
    Проверяю, не продолжается ли нативная запись Android…
  </div>;

  return <div className="flex h-full min-h-0 flex-col">
    {isNative() && <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
      <span className="text-xs font-medium">Режим камеры</span>
      <Button size="sm" variant={mode === "web" ? "default" : "outline"}
        disabled={switching || blocked || mode === "web"} onClick={() => void switchTo("web")}>
        Обычная камера
      </Button>
      <Button size="sm" variant={mode === "native" ? "default" : "outline"}
        disabled={switching || blocked || mode === "native"} onClick={() => void switchTo("native")}>
        Нативная запись
      </Button>
    </div>}
    {notice && <p role="alert" className="shrink-0 bg-card p-2 text-xs text-destructive">{notice}</p>}
    {mode === "web" ? <div className="relative min-h-0 flex-1"><CameraTab /></div> :
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <p className="text-xs text-muted-foreground">
          В этом режиме Android Camera2 владеет записью вне WebView. Предпросмотр WebView
          отключён, чтобы не захватывать одну камеру дважды. Выберите объектив и начните съёмку.
          Системное уведомление позволяет остановить запись даже после изменения экрана.
        </p>
        <NativeRecordingPanel />
      </div>}
  </div>;
}
