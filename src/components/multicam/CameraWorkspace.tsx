import { Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useMulticamStore } from "@/lib/multicam-store";
import { isNative } from "@/lib/native";
import { nativeCapture, nativeRecorderOwnsCamera } from "@/lib/native-capture";
import { mayFinishCameraOwnerSwitch } from "@/lib/camera-owner-handoff";
import { diagnosticCaptureGate } from "@/lib/diagnostic-capture-gate";
import { bounded } from "@/lib/async";
import { startNativeStatusRecovery } from "@/lib/camera-availability-retry";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";
import { Button } from "@/components/ui/button";
// The complete web camera and media/AI tools load after the native shell paints.
const CameraTab = lazy(() => import("./CameraTab").then(m => ({ default: m.CameraTab })));
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
  const [nativeUiReady, setNativeUiReady] = useState(false);
  const [webUiReady, setWebUiReady] = useState(() => !isNative());
  const [notice, setNotice] = useState("");
  const [statusNotice, setStatusNotice] = useState("");
  const [switching, setSwitching] = useState(false);
  useSyncExternalStore(diagnosticCaptureGate.subscribe, diagnosticCaptureGate.getSnapshot, diagnosticCaptureGate.getSnapshot);
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

  const manualModeSelection = useRef(false);
  useEffect(() => {
    if (mode !== "web") {
      setWebUiReady(false);
      return;
    }
    if (webUiReady) return;
    // Astra: Android startup can restore the media-heavy CameraTab while
    // WindowManager registration and WebView's first GPU frame are in flight.
    // Keep every camera feature, but load that full module only after the
    // lightweight mode/ownership shell has responded to several frames.
    let alive = true;
    const cancel = scheduleAfterResponsivePaint(() => {
      if (alive) setWebUiReady(true);
    }, { stableFrames: 3, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true });
    return () => { alive = false; cancel(); };
  }, [mode, webUiReady]);
  useEffect(() => {
    if (mode !== "native") {
      setNativeUiReady(false);
      return;
    }
    // Restored native mode must not query CameraManager while the WebView
    // retires the outgoing camera surface. No Camera2 capability is disabled.
    let live = true;
    const cancel = scheduleAfterResponsivePaint(() => {
      if (live) setNativeUiReady(true);
    }, { stableFrames: 3, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true });
    return () => { live = false; cancel(); };
  }, [mode]);
  useEffect(() => {
    if (!isNative()) return;
    // CameraWorkspace is itself mounted only after responsive frames by
    // CameraEntryGate. A falsely-hidden Android WebView must not skip its
    // FIRST read-only Camera2 ownership check forever, otherwise a running
    // native recording cannot restore its mode on app reopening. Defer only
    // subsequent retry polls while truly backgrounded.
    let initialOwnershipRead = true;
    // Emulators can have no usable camera at all. A failed status read is
    // neither permission to open WebView's camera nor a reason to block tabs.
    // Keep retrying only the READ-ONLY ownership check, with backoff and one
    // bounded attempt at a time; never trigger getUserMedia or start Camera2.
    return startNativeStatusRecovery(
      () => bounded(nativeCapture.status(), 2200, "Camera2 startup ownership"),
      status => {
        setStatusNotice("");
        if (manualModeSelection.current) return;
        let preference: Mode = "web";
        try { if (localStorage.getItem(PREF) === "native") preference = "native"; }
        catch { /* storage may be unavailable */ }
        if (nativeRecorderOwnsCamera(status.state) || preference === "native")
          setMode("native");
      },
      () => setStatusNotice("Camera2 пока не отвечает. Приложение работает; проверю её снова автоматически."),
      () => {
        if (initialOwnershipRead) {
          initialOwnershipRead = false;
          return true;
        }
        return !document.hidden;
      },
    );
  }, []);

  const switchTo = useCallback(async (next:Mode) => {
    if (mode === next || switching || blocked) return;
    // The user's choice becomes permanent only AFTER Android confirms
    // the handoff. A failed/aborted Camera2 status request must not suppress
    // subsequent automatic restoration of an already-running native capture.
    const previousManualSelection = manualModeSelection.current;
    manualModeSelection.current = true; // quarantine racing startup replies
    let committed = false;
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
      committed = true;
      try { localStorage.setItem(PREF, next); } catch { /* usable without storage */ }
    } catch (error) {
      if (mounted.current)
        setNotice(error instanceof Error ? error.message : "Камера ещё занята");
    } finally {
      if (!committed) manualModeSelection.current = previousManualSelection;
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
    {statusNotice && <p role="status" className="shrink-0 bg-card p-2 text-xs text-muted-foreground">{statusNotice}</p>}
    {notice && <p role="alert" className="shrink-0 bg-card p-2 text-xs text-destructive">{notice}</p>}
    {mode === "web" ? <div className="relative min-h-0 flex-1">
      {webUiReady ? <Suspense fallback={<p role="status" className="p-3 text-xs text-muted-foreground">Загрузка камеры…</p>}>
        <CameraTab onOpenNativeMode={isNative() ? () => { void switchTo("native"); } : undefined} />
      </Suspense> : <p role="status" className="p-3 text-xs text-muted-foreground">Подготовка камеры…</p>}
    </div> :
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <p className="text-xs text-muted-foreground">
          В этом режиме Android Camera2 владеет записью вне WebView. Предпросмотр WebView
          отключён, чтобы не захватывать одну камеру дважды. Выберите объектив и начните съёмку.
          Системное уведомление позволяет остановить запись даже после изменения экрана.
        </p>
        {nativeUiReady ? <Suspense fallback={<p role="status" className="p-3 text-xs text-muted-foreground">Загрузка нативной камеры…</p>}>
          <NativeRecordingPanel />
        </Suspense> : <p role="status" className="p-3 text-xs text-muted-foreground">Подготовка нативной камеры…</p>}
      </div>}
  </div>;
}
