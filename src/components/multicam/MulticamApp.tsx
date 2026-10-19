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
import { mesh } from "@/lib/mesh";
import { useT } from "@/lib/i18n";

const nav: { id: AppTab; icon: typeof Camera }[] = [{ id: "camera", icon: Camera }, { id: "editor", icon: SlidersHorizontal }, { id: "settings", icon: Settings }];
const labels: Record<string, string[]> = { kk: ["Камера", "Редактор", "Баптаулар"], pt: ["Câmera", "Editor", "Ajustes"], es: ["Cámara", "Editor", "Ajustes"], fr: ["Caméra", "Montage", "Réglages"], ar: ["الكاميرا", "المحرر", "الإعدادات"], zh: ["相机", "编辑", "设置"], ko: ["카메라", "편집기", "설정"], ja: ["カメラ", "編集", "設定"], de: ["Kamera", "Editor", "Einstellungen"], it: ["Camera", "Editor", "Impostazioni"], tr: ["Kamera", "Kurgu", "Ayarlar"], pl: ["Kamera", "Edytor", "Ustawienia"], hi: ["कैमरा", "संपादक", "सेटिंग्स"], vi: ["Máy quay", "Biên tập", "Cài đặt"], id: ["Kamera", "Editor", "Pengaturan"] };

function useMeshBridge() {
  const role = useMulticamStore((x) => x.role); const recording = useMulticamStore((x) => x.recording); const set = useMulticamStore((x) => x.set);
  const roleRef = useRef(role); roleRef.current = role;
  const setRef = useRef(set); setRef.current = set;
  useEffect(() => mesh.onMessage((msg) => {
    if (msg.type === "record" && roleRef.current === "slave") setRef.current({ recording: msg.on, recordingStartedAt: msg.on ? Date.now() : null });
  }), []);
  useEffect(() => { if (role === "host") mesh.send({ type: "record", from: mesh.selfId, on: recording, at: Date.now() }); }, [role, recording]);
}

function MulticamAppContent() {
  const tab = useMulticamStore((x) => x.tab); const setTab = useMulticamStore((x) => x.setTab); const language = useMulticamStore((x) => x.language); const role = useMulticamStore((x) => x.role); const clean = useMulticamStore((x) => x.cleanFrame && x.tab === "camera");
  const { t } = useT(); const peers = useMeshPeers(); const [connectOpen, setConnectOpen] = useState(false);
  useMeshBridge();
  const setStore = useMulticamStore((x) => x.set); const ready = useMulticamStore((x) => x.capMatrix !== null); const mediaOpen = useMulticamStore((x) => x.mediaOpen);
  const onProbed = useCallback((capMatrix: import("@/lib/capabilities").CapabilityMatrix) => setStore({ capMatrix }), [setStore]);
  useEffect(() => { document.documentElement.dir = language === "ar" ? "rtl" : "ltr"; document.documentElement.lang = language; }, [language]);
  const theme = useMulticamStore((x) => x.theme);
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); }, [theme]);
  const current = labels[language] ?? [t("camera"), t("editor"), t("settings")];
  return <div className="app-stage"><div className="app-shell">{!ready && <SplashScreen onDone={onProbed} />}{ready && <div className={`app-scroll ${tab === "camera" ? "flex flex-col overflow-hidden" : ""}`}>
    {!clean && <header className="app-header">
      <div className="min-w-0">{tab !== "settings" && <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">MULTI-CAM POV</p>}</div>
      <div className="flex items-center gap-2">{tab === "editor" && <motion.button whileTap={{ scale: .94 }} aria-label="Медиатека" aria-expanded={mediaOpen} onClick={() => setStore({ mediaOpen: !mediaOpen })} className={`connect-pill active ${mediaOpen ? "ring-1 ring-primary" : ""}`}><FolderOpen className="size-4" /></motion.button>}
      {tab === "editor" && <motion.button whileTap={{ scale: .94 }} onClick={() => setStore({ exportOpen: true, mediaOpen: false })} className="connect-pill active"><Download className="size-4" /><span>{t("export")}</span></motion.button>}
      <motion.button whileTap={{ scale: .94 }} onClick={() => setConnectOpen(true)} className={`connect-pill ${role !== "solo" ? "active" : ""}`}>
        <Link2 className="size-4" /><span className="truncate">{role === "solo" ? t("connect") : `${t(role)} · ${peers.length}`}</span>
        {role !== "solo" && <span className={`h-2 w-2 shrink-0 rounded-full ${peers.length ? "bg-status" : "bg-warning"}`} />}
      </motion.button></div>
    </header>}
    <AnimatePresence mode="wait"><motion.div key={tab} className={tab === "camera" ? "relative min-h-0 flex-1" : ""} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: .18 }}>{tab === "camera" ? <CameraTab /> : tab === "editor" ? <EditorTab /> : <SettingsTab />}</motion.div></AnimatePresence>
    </div>}{ready && !clean && <nav className="bottom-nav" aria-label="Primary navigation">{nav.map(({ id, icon: Icon }, index) => <button key={id} aria-label={current[index]} onClick={() => setTab(id)} className={tab === id ? "active" : ""}><Icon /><span>{current[index]}</span>{tab === id && <motion.i layoutId="nav-active" />}</button>)}</nav>}
    <AnimatePresence>{ready && connectOpen && <ConnectModal onClose={() => setConnectOpen(false)} />}</AnimatePresence>
  </div></div>;
}

export function MulticamApp() { return <MulticamStoreProvider><MulticamAppContent /></MulticamStoreProvider>; }
