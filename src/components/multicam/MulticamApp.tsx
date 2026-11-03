import { CameraWorkspace } from "./CameraWorkspace";
import { readUnfinishedCapture, clearUnfinishedCapture } from "@/lib/capture-interruption";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, Download, FolderOpen, Link2, Settings, SlidersHorizontal } from "lucide-react";
import { CameraTab } from "./CameraTab";
import { EditorTab } from "./EditorTab";
import { SettingsTab } from "./SettingsTab";
import { SplashScreen } from "./SplashScreen";
import { ConnectModal } from "./ConnectModal";
import { useMeshPeers } from "./useMesh";
import { MulticamStoreProvider, useMulticamStore, type AppTab } from "@/lib/multicam-store";
import { mesh, type RemoteRecordStatus } from "@/lib/mesh";
import { RemoteRecordGuard } from "@/lib/remote-record-guard";
import { nextRemoteReceiptStatus } from "@/lib/remote-record-receipts";
import { useT } from "@/lib/i18n";
import { startDisplayAdaptation } from "@/lib/display-topology";
import { FoldScrollRestorer } from "@/lib/fold-scroll-position";

const nav: { id: AppTab; icon: typeof Camera }[] = [{ id: "camera", icon: Camera }, { id: "editor", icon: SlidersHorizontal }, { id: "settings", icon: Settings }];
const labels: Record<string, string[]> = { kk: ["Камера", "Редактор", "Баптаулар"], pt: ["Câmera", "Editor", "Ajustes"], es: ["Cámara", "Editor", "Ajustes"], fr: ["Caméra", "Montage", "Réglages"], ar: ["الكاميرا", "المحرر", "الإعدادات"], zh: ["相机", "编辑", "设置"], ko: ["카메라", "편집기", "설정"], ja: ["カメラ", "編集", "設定"], de: ["Kamera", "Editor", "Einstellungen"], it: ["Camera", "Editor", "Impostazioni"], tr: ["Kamera", "Kurgu", "Ayarlar"], pl: ["Kamera", "Edytor", "Ustawienia"], hi: ["कैमरा", "संपादक", "सेटिंग्स"], vi: ["Máy quay", "Biên tập", "Cài đặt"], id: ["Kamera", "Editor", "Pengaturan"] };

function useMeshBridge() {
  const role = useMulticamStore((x) => x.role);
  const recording = useMulticamStore((x) => x.recording);
  const recordingPhase = useMulticamStore((x) => x.recordingPhase);
  const sessionCode = useMulticamStore((x) => x.sessionCode);
  const store = useMulticamStore((x) => x);
  const current = useRef(store); current.current = store;
  const guard = useRef(new RemoteRecordGuard());
  const outgoingTimestamp = useRef(0);
  const remoteReceipt = useRef<{to:string;at:number;status:RemoteRecordStatus}|null>(null);
  // An old director must not hold the newly paired slave indefinitely.
  // Keep replay protection within one session, but reset it on role/pairing.
  useEffect(() => {
    guard.current.reset();
    remoteReceipt.current = null;
  }, [role, sessionCode]);
  useEffect(() => mesh.onMessage((msg) => {
    if (msg.type !== "record") return;
    const state = current.current;
    const peer = mesh.peers.get(msg.from);
    const knownPeer = !!peer && Date.now() - peer.lastSeen < 12000;
    const patch = guard.current.accept(msg, state, knownPeer);
    if (patch) {
      remoteReceipt.current = { to:msg.from, at:msg.at, status:"received" };
      state.set(patch);
      // Receipt means only the command passed validation. It is NOT proof
      // MediaRecorder started or that a file was saved.
      mesh.send({type:"record-result",from:mesh.selfId,to:msg.from,
        at:msg.at,status:"received"});
    }
  }), []);
  useEffect(() => {
    const receipt = remoteReceipt.current;
    if (!receipt || role !== "slave") return;
    const phase = nextRemoteReceiptStatus(receipt.status, recordingPhase);
    if (!phase) return;
    receipt.status = phase;
    mesh.send({type:"record-result",from:mesh.selfId,to:receipt.to,
      at:receipt.at,status:phase});
    if (phase === "saved" || phase === "error") remoteReceipt.current = null;
  }, [role, recordingPhase, recording]);
  useEffect(() => mesh.subscribe(() => {
    const state = current.current;
    const now = Date.now();
    const stopped = guard.current.onDirectorDisconnected(state, id => {
      const peer = mesh.peers.get(id);
      return !!peer && now - peer.lastSeen < 12000;
    });
    if (stopped) state.set(stopped);
  }), []);
  useEffect(() => {
    if (role !== "host") return;
    // Start and stop may happen inside the same millisecond. Timestamp
    // ordering must stay strict without relying on wall-clock granularity.
    outgoingTimestamp.current = Math.max(Date.now(), outgoingTimestamp.current + 1);
    mesh.send({ type: "record", from: mesh.selfId, on: recording,
      at: outgoingTimestamp.current });
  }, [role, recording]);
}

function MulticamAppContent() {
  const tab = useMulticamStore((x) => x.tab); const setTab = useMulticamStore((x) => x.setTab); const language = useMulticamStore((x) => x.language); const role = useMulticamStore((x) => x.role); const clean = useMulticamStore((x) => x.cleanFrame && x.tab === "camera");
  const { t } = useT(); const peers = useMeshPeers(); const [connectOpen, setConnectOpen] = useState(false);
  const recording = useMulticamStore((x) => x.recording);
  const recordingPhase = useMulticamStore((x) => x.recordingPhase);
  const [pendingTab, setPendingTab] = useState<AppTab | null>(null);
  const [navigationNotice, setNavigationNotice] = useState("");
  const [interrupted, setInterrupted] = useState(() => readUnfinishedCapture());
  const appScrollRef = useRef<HTMLDivElement>(null);
  const scrollRestorer = useRef(new FoldScrollRestorer());
  const captureTabScroll = useCallback(() => {
    if (appScrollRef.current) scrollRestorer.current.capture(appScrollRef.current);
    scrollRestorer.current.pauseForTransition();
  }, []);
  useEffect(() => {
    const port = appScrollRef.current;
    if (!port) return;
    const restorer = scrollRestorer.current;
    restorer.activate(tab, port);
    const timers: number[] = [];
    // AnimatePresence mode="wait" exits the old screen before entering the
    // new one. A retry after the entry lets late media-library content settle.
    timers.push(window.setTimeout(() => restorer.enter(tab, port), 260));
    for (const delay of [450, 1100, 2400]) {
      timers.push(window.setTimeout(() => restorer.retry(tab, port), delay));
    }
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => restorer.retry(tab, port));
      observer.observe(port);
      if (port.firstElementChild instanceof HTMLElement)
        observer.observe(port.firstElementChild);
    }
    // Editor clips can finish loading long after the initial fold animation.
    // Watch content additions rather than guessing a fixed load duration.
    const contentObserver = typeof MutationObserver === "undefined" ? null :
      new MutationObserver(() => {
        if (restorer.pending(tab)) restorer.retry(tab, port);
      });
    contentObserver?.observe(port, {childList: true, subtree: true});
    const onPageHide = () => restorer.capture(port);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      timers.forEach(t => window.clearTimeout(t));
      observer?.disconnect();
      contentObserver?.disconnect();
      window.removeEventListener("pagehide", onPageHide);
      // A tab switch may have already rendered the next screen into this
      // scroll container. Capture happens before setTab, not in cleanup.
    };
  }, [tab]);
  useEffect(() => {
    if (interrupted) setNavigationNotice("Предыдущая запись могла прерваться. Проверьте сохранённые клипы; запись автоматически не продолжалась.");
  }, [interrupted]);
  useMeshBridge();
  // Keep the logical screen authoritative while Framer Motion temporarily
  // keeps both old and new tab DOM trees mounted during a fold transition.
  useEffect(() => {
    document.documentElement.dataset["activeMulticamTab"] = tab;
    return () => { delete document.documentElement.dataset["activeMulticamTab"]; };
  }, [tab]);
  // Window changes only rearrange UI; they never restart the camera pipeline.
  useEffect(() => startDisplayAdaptation(), []);
  const setStore = useMulticamStore((x) => x.set);
  // Leaving the camera tears down its WebView MediaStream and recorder.
  // Never unmount CameraTab before MediaRecorder.onstop and the IndexedDB
  // transaction confirm that the user's video was actually saved.
  const requestTab = useCallback((next: AppTab) => {
    if (next === tab) return;
    if (recordingPhase === "starting") {
      setNavigationNotice("Запись запускается. Дождитесь подтверждения перед переходом.");
      return;
    }
    if (recording || ["recording", "stopping", "saving"].includes(recordingPhase)) {
      setPendingTab(next);
      setNavigationNotice("Останавливаю запись и сохраняю видео перед переходом…");
      if (recording && recordingPhase === "recording")
        setStore({ recording: false, recordingPhase: "stopping" });
      return;
    }
    setPendingTab(null);
    setNavigationNotice("");
    captureTabScroll();
    setTab(next);
  }, [tab, recording, recordingPhase, setStore, setTab, captureTabScroll]);
  useEffect(() => {
    if (!pendingTab) return;
    if (recordingPhase === "saved" && !recording) {
      setNavigationNotice("");
      captureTabScroll();
      setTab(pendingTab);
      setPendingTab(null);
    } else if (recordingPhase === "error") {
      setNavigationNotice("Видео не сохранено. Исправьте ошибку перед переходом.");
      setPendingTab(null);
    }
  }, [pendingTab, recordingPhase, recording, setTab, captureTabScroll]);
  const ready = useMulticamStore((x) => x.capMatrix !== null); const mediaOpen = useMulticamStore((x) => x.mediaOpen);
  const onProbed = useCallback((capMatrix: import("@/lib/capabilities").CapabilityMatrix) => setStore({ capMatrix }), [setStore]);
  useEffect(() => { document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; document.documentElement.lang = language; }, [language]);
  const theme = useMulticamStore((x) => x.theme);
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);
  const current = labels[language] ?? [t("camera"), t("editor"), t("settings")];
  return <div className="app-stage"><div className="app-shell">{!ready && <SplashScreen onDone={onProbed} />}<div ref={appScrollRef} onScroll={(event) => scrollRestorer.current.onScroll(tab, event.currentTarget)}
    className={`app-scroll ${tab === "camera" ? "flex flex-col overflow-hidden" : ""}`}>
    {!clean && <header className="app-header">
      <div className="min-w-0">{tab !== "settings" && <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">MULTI-CAM POV</p>}</div>
      <div className="flex items-center gap-2">{tab === "editor" && <motion.button whileTap={{ scale: .94 }} aria-label="Медиатека" aria-expanded={mediaOpen} onClick={() => setStore({ mediaOpen: !mediaOpen })} className={`connect-pill active ${mediaOpen ? "ring-1 ring-primary" : ""}`}><FolderOpen className="size-4" /></motion.button>}
      {tab === "editor" && <motion.button whileTap={{ scale: .94 }} onClick={() => setStore({ exportOpen: true, mediaOpen: false })} className="connect-pill active"><Download className="size-4" /><span>{t("export")}</span></motion.button>}
      <motion.button whileTap={{ scale: .94 }} onClick={() => setConnectOpen(true)} className={`connect-pill ${role !== "solo" ? "active" : ""}`}>
        <Link2 className="size-4" /><span className="truncate">{role === "solo" ? t("connect") : `${t(role)} · ${peers.length}`}</span>
        {role !== "solo" && <span className={`h-2 w-2 shrink-0 rounded-full ${peers.length ? "bg-status" : "bg-warning"}`} />}
      </motion.button></div>
    </header>}
    <AnimatePresence mode="wait"><motion.div key={tab} className={tab === "camera" ? "relative min-h-0 flex-1" : ""} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18 }}>{tab === "camera" ? <CameraWorkspace /> : tab === "editor" ? <EditorTab /> : <SettingsTab />}</motion.div></AnimatePresence>
    </div>{!clean && <nav className="bottom-nav" aria-label="Primary navigation">{nav.map(({ id, icon: Icon }, index) => <button key={id} aria-label={current[index]} onClick={() => requestTab(id)} className={tab === id ? "active" : ""}><Icon /><span>{current[index]}</span>{tab === id && <motion.i layoutId="nav-active" />}</button>)}</nav>}
    {navigationNotice && <div role="status" className="app-navigation-notice absolute inset-x-3 bottom-[calc(var(--nav-h)+0.5rem)] z-50 rounded-lg border border-border bg-card p-3 text-xs text-foreground shadow-lg">{navigationNotice}
      {interrupted && <div className="mt-2 flex flex-wrap gap-2">
        <button className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground" onClick={() => { setTab("editor"); setStore({mediaOpen:true}); }}>Проверить клипы</button>
        <button className="rounded-md border border-border px-3 py-1.5" onClick={() => {
          setTab("camera");
          setNavigationNotice("Открыта камера. Нажмите «Запись» вручную, чтобы начать НОВЫЙ сегмент. Прошлая запись не продолжается автоматически.");
        }}>Перейти к новой записи</button>
        <button className="rounded-md border border-border px-3 py-1.5" onClick={() => {
          clearUnfinishedCapture(interrupted.kind,interrupted.startedAt);
          setInterrupted(null); setNavigationNotice("");
        }}>Понятно, закрыть предупреждение</button>
      </div>}
    </div>}
    <AnimatePresence>{connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} />}</AnimatePresence>
  </div></div>;
}

export function MulticamApp() { return <MulticamStoreProvider><MulticamAppContent /></MulticamStoreProvider>; }
