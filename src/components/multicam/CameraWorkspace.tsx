import { Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMulticamStore } from "@/lib/multicam-store";
import { isNative } from "@/lib/native";
import { nativeCapture, nativeRecorderOwnsCamera } from "@/lib/native-capture";
import { mayFinishCameraOwnerSwitch } from "@/lib/camera-owner-handoff";
import { diagnosticCaptureGate } from "@/lib/diagnostic-capture-gate";
import { bounded } from "@/lib/async";
import { Button } from "@/components/ui/button";
import { CameraTab } from "./CameraTab";
// Native Camera2 viewer is excluded from the ordinary WebView startup bundle.
const NativeRecordingPanel = lazy(() => import("./NativeRecordingPanel").then(m => ({ default: m.NativeRecordingPanel })));

type Mode = "web" | "native";
const PREF = "multicam-user-camera-mode-v1";

/** Switching mode actually unmounts WebCameraTab and releases its MediaStream.
 * Recording never changes owner on a responsive layout breakpoint. */
export function CameraWorkspace() {
  const recording = useMulticamStore(s => s.recording);
  const phase = useMulticamStore(s => s.recordingPhase);
  const [mode, setMode] = useState<Mode>("web"); // No permission or camera stream is opened here.
  const [notice, setNotice] = useState("");
  const [switching, setSwitching] = useState(false);
  useSyncExternalStore(diagnosticCaptureGate.subscribe, diagnosticCaptureGate.getSnapshot);
  const blocked = recording || diagnosticCaptureGate.activeOperation() !== null ||
    ["starting","recording","stopping","saving"].includes(phase);
  const latestRecording = useRef(recording);
  const latestPhase = useRef(phase);
  const mounted = useRef(true);
  latestRecording.current = recording;
  latestPhase.current = phase;
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    let live = true;
    // Android binder may never reply after Activity recreation. Fail closed
    // into the native owner panel instead of freezing a blank camera page.
    void bounded(nativeCapture.status(), 2200, "Camera2 startup ownership").then(status => {
      if (!live) return;
      let preference:Mode = "web";
      try { if (localStorage.getItem(PREF) === "native") preference = "native"; }
      catch { /* private storage unavailable */ }
      // A surviving Android service must always keep ownership after WebView
      // Activity recreation. Never reopen getUserMedia before checking it.
      setMode(nativeRecorderOwnsCamera(status.state) ? "native" : preference);
    }).catch(() => {
      if (live) {
        // The placeholder never acquires a sensor. When the user presses
        // "Включить камеру", its own Camera2 guard still requires a proved
        // idle native owner, so a failed bridge cannot steal the camera.
        setMode("web");
        setNotice("Статус Camera2 неизвестен. Камера пока выключена.");
      }
    });
    return () => { live = false; };
  }, []);

  const switchTo = useCallback(async (next:Mode) => {
    if (mode === next || switching || blocked) return;
    setSwitching(true);
    try {
      if (next === "web") {
        const status = await bounded(nativeCapture.status(), 2200, "Camera2 mode handoff");
        if (nativeRecorderOwnsCamera(status.state))
          throw Error("Нативная запись ещё работает. Остановите её перед открытием обычного предпросмотра.");
      }
      // The native status request is async. A recording or fold remount may
      // have happened while it was pending: never steal camera ownership then.
      if (!mayFinishCameraOwnerSwitch(mounted.current, latestRecording.current, latestPhase.current) ||
          diagnosticCaptureGate.activeOperation() !== null) return;
      setNotice("");
      setMode(next);
      try { localStorage.setItem(PREF, next); } catch { /* usable without storage */ }
    } catch (error) {
      if (mounted.current)
        setNotice(error instanceof Error ? error.message : "Камера ещё занята");
    } finally {
      if (mounted.current) setSwitching(false);
    }
  }, [mode,switching,blocked]);

  return <div className="flex h-full min-h-0 flex-col">
    {isNative() && mode === "native" && <div className="camera-mode-switch flex shrink-0 items-center justify-end gap-1 border-b border-border/40 bg-card/50 px-2 py-1" role="group" aria-label="Режим камеры">
      <span className="mr-auto truncate text-[10px] text-muted-foreground">Режим</span>
      <Button size="sm" className="h-7 min-h-0 px-2 text-[10px]" variant="outline"
        disabled={switching || blocked} onClick={() => void switchTo("web")}>
        Обычная
      </Button>
      <Button size="sm" className="h-7 min-h-0 px-2 text-[10px]" variant="default"
        disabled={switching || blocked || mode === "native"} onClick={() => void switchTo("native")}>
        Camera2
      </Button>
    </div>}
    {notice && <p role="alert" className="shrink-0 bg-card p-2 text-xs text-destructive">{notice}</p>}
    {mode === "web" ? <div className="relative min-h-0 flex-1"><CameraTab onOpenNativeMode={isNative() ? () => { void switchTo("native"); } : undefined} /></div> :
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <p className="text-xs text-muted-foreground">
          В этом режиме Android Camera2 владеет записью вне WebView. Предпросмотр WebView
          отключён, чтобы не захватывать одну камеру дважды. Выберите объектив и начните съёмку.
          Системное уведомление позволяет остановить запись даже после изменения экрана.
        </p>
        <Suspense fallback={<p role="status" className="p-3 text-xs text-muted-foreground">Загрузка нативной камеры…</p>}>
          <NativeRecordingPanel />
        </Suspense>
      </div>}
  </div>;
}
