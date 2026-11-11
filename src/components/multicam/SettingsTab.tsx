import { HelpDot } from "./Help";
import { Component, Suspense, lazy, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Activity, ChevronRight, Database, Gauge, Globe2, HardDrive, Moon, RotateCcw, ShieldCheck, Sun, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/lib/multicam-store";
import { useT } from "@/lib/i18n";
import { activateAccessibleDialog } from "@/lib/accessible-dialog";
import { traceUiAction } from "@/lib/freeze-action-trace";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";
import { scheduleSettingsVisualStage } from "@/lib/settings-visual-stage";
import { Capacitor } from "@capacitor/core";

// Load native recording and camera diagnosis only if explicitly opened.
const NativeRecordingPanel = lazy(() => import("./NativeRecordingPanel").then(m => ({ default: m.NativeRecordingPanel })));
const CameraDiagnostics = lazy(() => import("./CameraDiagnostics").then(m => ({ default: m.CameraDiagnostics })));
const SettingsNetworkContent = lazy(() => import("./SettingsNetworkContent").then(m => ({ default: m.SettingsNetworkContent })));
const SettingsPrivacyDialog = lazy(() => import("./SettingsPrivacyDialog").then(m => ({ default: m.SettingsPrivacyDialog })));

const languages = [
  ["en","English"],["ru","Русский"],["kk","Қазақ тілі"],["pt","Português"],["es","Español"],["fr","Français"],["ar","العربية"],["zh","中文"],["ko","한국어"],["ja","日本語"],["de","Deutsch"],["it","Italiano"],["tr","Türkçe"],["pl","Polski"],["hi","हिन्दी"],["vi","Tiếng Việt"],["id","Bahasa Indonesia"],
];
const themeCopy: Record<string, { theme:string; light:string; dark:string }> = {
 en:{theme:"Theme",light:"Light",dark:"Dark"}, ru:{theme:"Тема",light:"Светлая",dark:"Тёмная"}, kk:{theme:"Тақырып",light:"Жарық",dark:"Қараңғы"},
 ar:{theme:"المظهر",light:"فاتح",dark:"داكن"}, zh:{theme:"主题",light:"浅色",dark:"深色"}, ko:{theme:"테마",light:"라이트",dark:"다크"}, ja:{theme:"テーマ",light:"ライト",dark:"ダーク"},
 pt:{theme:"Tema",light:"Claro",dark:"Escuro"}, es:{theme:"Tema",light:"Claro",dark:"Oscuro"}, fr:{theme:"Thème",light:"Clair",dark:"Sombre"},
 de:{theme:"Design",light:"Hell",dark:"Dunkel"}, it:{theme:"Tema",light:"Chiaro",dark:"Scuro"}, tr:{theme:"Tema",light:"Açık",dark:"Koyu"}, pl:{theme:"Motyw",light:"Jasny",dark:"Ciemny"},
 hi:{theme:"थीम",light:"लाइट",dark:"डार्क"}, vi:{theme:"Giao diện",light:"Sáng",dark:"Tối"}, id:{theme:"Tema",light:"Terang",dark:"Gelap"},
};
const copy: Record<string, { title:string; language:string; network:string; storage:string; engine:string; privacy:string; clear:string }> = {
 en:{title:"Settings",language:"Language",network:"Mesh diagnostics",storage:"Storage & cache",engine:"Render engine",privacy:"Privacy Policy",clear:"Clear cache"},
 ru:{title:"Настройки",language:"Язык",network:"Диагностика сети",storage:"Хранилище и кэш",engine:"Движок рендера",privacy:"Политика конфиденциальности",clear:"Очистить кэш"},
 kk:{title:"Баптаулар",language:"Тіл",network:"Желі диагностикасы",storage:"Жад және кэш",engine:"Рендер қозғалтқышы",privacy:"Құпиялылық саясаты",clear:"Кэшті тазалау"},
 ar:{title:"الإعدادات",language:"اللغة",network:"تشخيص الشبكة",storage:"التخزين والتخزين المؤقت",engine:"محرك العرض",privacy:"سياسة الخصوصية",clear:"مسح التخزين المؤقت"},
 zh:{title:"设置",language:"语言",network:"网状网络诊断",storage:"存储与缓存",engine:"渲染引擎",privacy:"隐私政策",clear:"清除缓存"},ko:{title:"설정",language:"언어",network:"메시 진단",storage:"저장 공간 및 캐시",engine:"렌더 엔진",privacy:"개인정보 처리방침",clear:"캐시 지우기"},ja:{title:"設定",language:"言語",network:"メッシュ診断",storage:"ストレージとキャッシュ",engine:"レンダーエンジン",privacy:"プライバシーポリシー",clear:"キャッシュを消去"},
 pt:{title:"Ajustes",language:"Idioma",network:"Diagnóstico de rede",storage:"Armazenamento e cache",engine:"Motor de renderização",privacy:"Política de Privacidade",clear:"Limpar cache"},es:{title:"Ajustes",language:"Idioma",network:"Diagnóstico de red",storage:"Almacenamiento y caché",engine:"Motor de renderizado",privacy:"Política de privacidad",clear:"Borrar caché"},fr:{title:"Réglages",language:"Langue",network:"Diagnostic réseau",storage:"Stockage et cache",engine:"Moteur de rendu",privacy:"Politique de confidentialité",clear:"Vider le cache"},
 de:{title:"Einstellungen",language:"Sprache",network:"Netzwerkdiagnose",storage:"Speicher und Cache",engine:"Render-Engine",privacy:"Datenschutzrichtlinie",clear:"Cache leeren"},it:{title:"Impostazioni",language:"Lingua",network:"Diagnostica rete",storage:"Archivio e cache",engine:"Motore di rendering",privacy:"Informativa sulla privacy",clear:"Svuota cache"},tr:{title:"Ayarlar",language:"Dil",network:"Ağ tanılama",storage:"Depolama ve önbellek",engine:"İşleme motoru",privacy:"Gizlilik Politikası",clear:"Önbelleği temizle"},pl:{title:"Ustawienia",language:"Język",network:"Diagnostyka sieci",storage:"Pamięć i cache",engine:"Silnik renderowania",privacy:"Polityka prywatności",clear:"Wyczyść cache"},
 hi:{title:"सेटिंग्स",language:"भाषा",network:"मेश निदान",storage:"स्टोरेज और कैश",engine:"रेंडर इंजन",privacy:"गोपनीयता नीति",clear:"कैश साफ़ करें"},vi:{title:"Cài đặt",language:"Ngôn ngữ",network:"Chẩn đoán mạng",storage:"Bộ nhớ và bộ đệm",engine:"Bộ máy kết xuất",privacy:"Chính sách quyền riêng tư",clear:"Xóa bộ đệm"},id:{title:"Pengaturan",language:"Bahasa",network:"Diagnostik jaringan",storage:"Penyimpanan dan cache",engine:"Mesin render",privacy:"Kebijakan Privasi",clear:"Hapus cache"},
};
// If a freeze report ends before this checkpoint, the lazy chunk itself
// stalled; if it ends before the layout commit, the initial Settings React
// render or its synchronous child work did not finish.
traceUiAction("settings: lazy module evaluated");

export function SettingsTab() {
 const s=useSettingsStore(); const {t:tr}=useT();
 const [readyBody, setReadyBody] = useState(() => !Capacitor.isNativePlatform());
 const [readyNetwork, setReadyNetwork] = useState(() => !Capacitor.isNativePlatform());
 const [readyUtilities, setReadyUtilities] = useState(() => !Capacitor.isNativePlatform());
 const [readyAdvanced, setReadyAdvanced] = useState(() => !Capacitor.isNativePlatform());
 useEffect(() => {
   if (readyBody) return;
   // Emulator #157 confirms the Settings entry and its full optional body
   // could be queued in the SAME recovered renderer turn after a 7s GPU
   // stall. The native first paint must finish before extra panels are
   // mounted. These tools remain fully available after this boundary.
   let cancelPaint: (() => void) | null = null;
   const bodyDelay = window.setTimeout(() => {
     cancelPaint = scheduleSettingsVisualStage(() => {
       traceUiAction("settings: body mounting after responsive paint");
       setReadyBody(true);
     }, { stableFrames: 3, maxFrameGapMs: 350, backgroundFallbackMs: 1800 });
   }, 350);
   return () => {
     window.clearTimeout(bodyDelay);
     cancelPaint?.();
   };
 }, [readyBody]);
 useEffect(() => {
   if (!readyBody || readyUtilities) return;
   let cancel: (() => void) | null = null;
   const timer = window.setTimeout(() => {
     cancel = scheduleSettingsVisualStage(() => {
       traceUiAction("settings: storage, engine and privacy ready");
       setReadyUtilities(true);
     }, { stableFrames: 4, maxFrameGapMs: 350, backgroundFallbackMs: 1800 });
   }, 450);
   return () => { window.clearTimeout(timer); cancel?.(); };
 }, [readyBody, readyUtilities]);
 useEffect(() => {
   if (!readyUtilities || readyAdvanced) return;
   let cancel: (() => void) | null = null;
   const timer = window.setTimeout(() => {
     cancel = scheduleSettingsVisualStage(() => {
       traceUiAction("settings: Camera2 and diagnostic actions ready");
       setReadyAdvanced(true);
     }, { stableFrames: 4, maxFrameGapMs: 350, backgroundFallbackMs: 1800 });
   }, 450);
   return () => { window.clearTimeout(timer); cancel?.(); };
 }, [readyUtilities, readyAdvanced]);
 useEffect(() => {
   if (!readyAdvanced || readyNetwork) return;
   // Do not import all network modules during Camera compositor teardown.
   // A short responsive-paint boundary keeps every Settings control available
   // without competing for the initial Settings frame on Android WebView.
   let cancelPaint: (() => void) | null = null;
   const timer = window.setTimeout(() => {
     cancelPaint = scheduleSettingsVisualStage(() => {
       traceUiAction("settings: network controls mounted after responsive paint");
       setReadyNetwork(true);
     }, { stableFrames: 4, maxFrameGapMs: 350, backgroundFallbackMs: 1800 });
   }, 1250);
   return () => { window.clearTimeout(timer); cancelPaint?.(); };
 }, [readyAdvanced, readyNetwork]);
 useLayoutEffect(() => { traceUiAction("settings: layout commit complete"); }, []); const [privacy,setPrivacy]=useState(false); const [privacyMounted,setPrivacyMounted]=useState(false); const [checking,setChecking]=useState(false); const [advancedPanel,setAdvancedPanel]=useState<"native" | "diagnostics" | null>(null); const t=copy[s.language] ?? copy["en"] ?? { title:"Settings",language:"Language",network:"Mesh diagnostics",storage:"Storage & cache",engine:"Render engine",privacy:"Privacy Policy",clear:"Clear cache" };

 const confirmationDialog=useRef<HTMLDivElement>(null);
 const [confirmAction,setConfirmAction]=useState<"cache"|"reset"|null>(null);
 const cacheBusy=useRef(false);
 const measurementBusy=useRef(false);
 useEffect(()=>{
   if(!confirmAction||!confirmationDialog.current)return;
   return activateAccessibleDialog(confirmationDialog.current,()=>setConfirmAction(null));
 },[confirmAction]);
 const alive = useRef(true); const [clearing, setClearing] = useState(false); const [operationError, setOperationError] = useState("");
 const [measuringCache, setMeasuringCache] = useState(false);
 const [cacheMeasured, setCacheMeasured] = useState(false);
 // IndexedDB can hold large video proxy blobs. Never enumerate them on entry
 // to settings or during rapid theme changes. Measure only when requested.
 useEffect(() => {
   alive.current = true;
   traceUiAction("settings: mounted");
   // Identify whether this WebView can paint and process timers after mounting.
   let frameA = 0;
   let frameB = 0;
   const timer = window.setTimeout(() => {
     if (alive.current) traceUiAction("settings: event loop alive 1s");
   }, 1000);
   frameA = window.requestAnimationFrame(() => {
     if (!alive.current) return;
     traceUiAction("settings: first paint frame");
     frameB = window.requestAnimationFrame(() => {
       if (alive.current) traceUiAction("settings: second paint frame");
     });
   });
   return () => {
     alive.current = false;
     window.cancelAnimationFrame(frameA);
     window.cancelAnimationFrame(frameB);
     window.clearTimeout(timer);
     traceUiAction("settings: unmounted");
   };
 }, []);
 const measureCache = async () => {
   traceUiAction("settings: cache measurement");
   // State updates can be batched. A ref prevents repeated taps from starting
   // parallel IndexedDB cursor scans before React has rendered "disabled".
   if (measurementBusy.current || cacheBusy.current) return;
   measurementBusy.current = true;
   setMeasuringCache(true); setOperationError("");
   try {
     const { cacheBytes } = await import("@/lib/media-cache");
     const bytes = await cacheBytes();
     if (alive.current) { s.set({ cacheMB: bytes / 1048576 }); setCacheMeasured(true); }
   } catch { if (alive.current) setOperationError("Не удалось измерить кэш. Попробуйте повторить."); }
   finally { measurementBusy.current = false; if (alive.current) setMeasuringCache(false); }
 };
 const clearCache = async () => {
   traceUiAction("settings: clear cache");
   if (cacheBusy.current || measurementBusy.current) return;
   cacheBusy.current=true;
   setClearing(true); setOperationError("");
   try { const { clearPreviewCache } = await import("@/lib/media-cache");
     const bytes = await clearPreviewCache(); if (alive.current) { s.set({ cacheMB: bytes / 1048576 }); setCacheMeasured(true); } }
   catch { if (alive.current) setOperationError("Не удалось очистить кэш. Исходные клипы не изменены."); }
   finally { cacheBusy.current=false; if (alive.current) setClearing(false); }
 };
 const acceptConfirmation=()=>{
   const action=confirmAction;
   setConfirmAction(null);
   if(action==="cache") { void clearCache(); }
   else if(action==="reset") { traceUiAction("settings: reset project"); s.resetProject(); }
 };
 const tc=themeCopy[s.language] ?? { theme:"Theme", light:"Light", dark:"Dark" };
 // Instrumentation-only binary isolation. This flag is never set by the
 // application; production mounts the exact same full Settings tree below.
 // Keeps the real Settings hooks, timers and imports while independently
 // testing the DOM subtree and its shared surface CSS.
 const freezeIsolation = document.documentElement.dataset["multicamFreezeIsolation"];
 if (freezeIsolation === "settings-module")
   return <section className="settings-fold-workspace" data-freeze-isolation="settings-module">Settings logic loaded, compositor minimal</section>;
 if (freezeIsolation === "settings-groups")
   return <div className="settings-fold-workspace" data-freeze-isolation="settings-groups">
     <header className="px-4 pb-2 pt-3"><h1 className="text-lg font-semibold">{t.title}</h1></header>
     <main className="mx-auto max-w-2xl space-y-2.5 px-3">
       <Group title={tc.theme}><div className="p-3">Светлая / Тёмная</div></Group>
       <Group title={t.language}><div className="settings-item">Язык</div></Group>
     </main>
   </div>;
  return <div className="settings-fold-workspace pb-[calc(4rem+env(safe-area-inset-bottom))] text-foreground"><header className="px-4 pb-2 pt-3"><h1 className="text-lg font-semibold">{t.title}</h1></header><main className="mx-auto max-w-2xl space-y-2.5 px-3">
  <Group title={tc.theme}><div className="p-3"><div className="theme-seg" role="radiogroup" aria-label={tc.theme}><Button variant="ghost" role="radio" aria-checked={s.theme==="light"} className={s.theme==="light"?"active":""} onClick={()=>{ traceUiAction("settings: theme light"); setAdvancedPanel(null); s.set({theme:"light"}); }}><Sun/>{tc.light}</Button><Button variant="ghost" role="radio" aria-checked={s.theme==="dark"} className={s.theme==="dark"?"active":""} onClick={()=>{ traceUiAction("settings: theme dark"); setAdvancedPanel(null); s.set({theme:"dark"}); }}><Moon/>{tc.dark}</Button></div></div></Group>
  <Group help="language" title={t.language}><label className="settings-item"><span className="flex items-center gap-3"><Globe2 className="text-primary"/> {t.language}</span><select value={s.language} onChange={(e)=>s.set({language:e.target.value})} className="max-w-44 bg-transparent text-end text-sm text-muted-foreground outline-none">{languages.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></Group>
 {readyBody && <>
  <Group help="network" title={t.network}>
   {readyNetwork ? <Suspense fallback={<p role="status" className="p-3 text-xs text-muted-foreground">Загрузка сетевых инструментов…</p>}>
     <SettingsNetworkContent />
   </Suspense> : <p role="status" className="p-3 text-xs text-muted-foreground">Подготовка сетевых инструментов…</p>}
  </Group>
 {readyUtilities && <>
 <Group help="cache" title={t.storage}><div className="settings-item"><span className="flex items-center gap-3"><HardDrive className="text-primary"/><span>{tr("offlineCache")}<small className="block text-xs text-muted-foreground">{cacheMeasured ? `${s.cacheMB.toFixed(2)} MB · превью` : "Размер кэша не измерен"}</small><button type="button" className="mt-1 text-xs font-semibold text-primary underline-offset-2 hover:underline" disabled={measuringCache || clearing} onClick={() => void measureCache()}>{measuringCache ? "Измерение…" : "Измерить размер"}</button></span></span><Button size="sm" variant="secondary" disabled={clearing || measuringCache} onClick={()=>setConfirmAction("cache")}><Trash2/>{t.clear}</Button></div></Group>
 <Group help="hwaccel" title={t.engine}><label className="settings-item"><span className="flex items-center gap-3"><Gauge className="text-primary"/><span>{tr("hwAccel")}<small className="block text-xs text-muted-foreground">{tr("hwAccelSub")}</small></span></span><Switch checked={s.hardwareAcceleration} onCheckedChange={(hardwareAcceleration)=>s.set({hardwareAcceleration})}/></label><button className="settings-item w-full" onClick={()=>setConfirmAction("reset")}><span className="flex items-center gap-3"><RotateCcw className="text-warning"/>{tr("resetProject")}</span><ChevronRight className="text-muted-foreground"/></button></Group>
 <Group><button className="settings-item w-full" onClick={()=>{setPrivacyMounted(true);setPrivacy(true);}}><span className="flex items-center gap-3"><ShieldCheck className="text-primary"/>{t.privacy}</span><ChevronRight className="text-muted-foreground"/></button></Group>
 </>}
 {/* Camera2 polling and camera discovery are expensive. Keep both fully
      unmounted until opened; CSS-hidden panels would still run native work. */}
 {readyAdvanced && <section className="settings-advanced-tools" aria-label="Дополнительные инструменты">
  <div className="settings-advanced-actions">
   <button type="button" className={"settings-tool-trigger" + (advancedPanel === "native" ? " active" : "")}
     aria-expanded={advancedPanel === "native"} onClick={() => { traceUiAction("settings: native tools"); setAdvancedPanel(p => p === "native" ? null : "native"); }}>
     <Database aria-hidden="true"/><span>Нативная запись Camera2</span><ChevronRight aria-hidden="true"/>
   </button>
   <button type="button" className={"settings-tool-trigger" + (advancedPanel === "diagnostics" ? " active" : "")}
     aria-expanded={advancedPanel === "diagnostics"} onClick={() => { traceUiAction("settings: camera diagnostics"); setAdvancedPanel(p => p === "diagnostics" ? null : "diagnostics"); }}>
     <Activity aria-hidden="true"/><span>Проверка камер</span><ChevronRight aria-hidden="true"/>
   </button>
  </div>
  <SettingsToolsBoundary key={advancedPanel ?? "closed"} onClose={() => setAdvancedPanel(null)}>
   <Suspense fallback={<p role="status" className="p-3 text-xs text-muted-foreground">Загрузка инструментов…</p>}>
    {advancedPanel === "native" && <NativeRecordingPanel previewIntervalMs={850} />}
    {advancedPanel === "diagnostics" && <CameraDiagnostics />}
   </Suspense>
  </SettingsToolsBoundary>
 </section>}
 {operationError && <p role="alert" className="text-sm text-destructive">{operationError}</p>}
  </>}</main>
 {confirmAction && <div className="settings-confirm-overlay fixed inset-x-0 top-0 bottom-[var(--nav-h)] z-50 flex items-center justify-center overflow-y-auto px-4 py-6" ref={confirmationDialog} role="alertdialog" aria-modal="true" aria-labelledby="settings-confirm-title" tabIndex={-1}>
   <div className="settings-confirm-card w-full max-w-sm rounded-2xl border border-border p-5 text-foreground">
     <h2 id="settings-confirm-title" className="text-base font-semibold">{confirmAction==="cache" ? "Очистить кэш?" : "Сбросить проект?"}</h2>
     <p className="mt-2 text-sm text-muted-foreground">{confirmAction==="cache" ? "Будут удалены только временные превью. Оригинальные видео и проект останутся." : "Будут сброшены параметры текущего проекта. Сохранённые видеоклипы не удаляются."}</p>
     <div className="mt-5 flex justify-end gap-2">
       <Button type="button" variant="outline" onClick={()=>setConfirmAction(null)}>Отмена</Button>
       <Button type="button" disabled={clearing || measuringCache} onClick={acceptConfirmation}>{confirmAction==="cache" ? "Очистить кэш" : "Сбросить"}</Button>
     </div>
   </div>
 </div>}
 {privacyMounted && <Suspense fallback={null}><SettingsPrivacyDialog
    open={privacy} title={t.privacy} legalTitle={tr("legal")}
    closeLabel={tr("close")} language={s.language} onClose={() => setPrivacy(false)}
  /></Suspense>}</div>;
}
/** A broken Camera2/diagnostics module must not crash Settings or navigation. */
class SettingsToolsBoundary extends Component<{ children: ReactNode; onClose: () => void }, { failed: boolean }> {
 override state = { failed: false };
 static getDerivedStateFromError() { return { failed: true }; }
 override render() {
   if (this.state.failed) return <div role="alert" className="glass-panel m-2 space-y-2 rounded-xl p-3 text-sm">
     <p>Не удалось открыть инструмент. Остальные настройки продолжают работать.</p>
     <button type="button" className="connect-pill" onClick={this.props.onClose}>Закрыть инструмент</button>
   </div>;
   return this.props.children;
 }
}

function Group({title,help,children}:{title?:string;help?:string;children:ReactNode}){return <section><h2 className="mb-1 flex items-center gap-1 px-2 text-[11px] font-semibold uppercase text-muted-foreground">{title}{help&&<HelpDot id={help}/>}</h2><div className="overflow-hidden rounded-lg bg-card">{children}</div></section>}
