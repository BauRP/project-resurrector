import { HelpDot } from "./Help";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ChevronRight, Database, Gauge, Globe2, HardDrive, Moon, RotateCcw, ShieldCheck, Sun, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useSettingsStore } from "@/lib/multicam-store";
import { useT } from "@/lib/i18n";
import { mesh } from "@/lib/mesh";
import { useMeshPeers } from "./useMesh";
import { cacheBytes, clearPreviewCache } from "@/lib/media-cache";
import { bounded, retry } from "@/lib/async";

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
export function SettingsTab() {
 const s=useSettingsStore(); const {t:tr}=useT(); const peers=useMeshPeers(); const [privacy,setPrivacy]=useState(false); const [checking,setChecking]=useState(false); const t=copy[s.language] ?? copy["en"] ?? { title:"Settings",language:"Language",network:"Mesh diagnostics",storage:"Storage & cache",engine:"Render engine",privacy:"Privacy Policy",clear:"Clear cache" };
 const alive = useRef(true); const busy = useRef(false); const [clearing, setClearing] = useState(false); const [operationError, setOperationError] = useState("");
 useEffect(() => { alive.current = true; void cacheBytes().then((bytes) => { if (alive.current) s.set({ cacheMB: bytes / 1048576 }); }).catch(() => { if (alive.current) setOperationError("Не удалось измерить кэш"); }); return () => { alive.current = false; }; }, [s.set]);
 const diagnose = async () => {
   if (busy.current) return; busy.current = true; setChecking(true); setOperationError("");
   try { const result = await retry(() => bounded(mesh.diagnose(), 5000, "Network diagnostics")); if (alive.current) s.set({ diagnostics: result }); }
   catch { if (alive.current) setOperationError("Нет ответа от устройств. Проверьте соединение и повторите тест."); }
   finally { busy.current = false; if (alive.current) setChecking(false); }
 };
 const clearCache = async () => {
   if (clearing || !window.confirm("Удалить только временные превью? Исходные клипы и проект останутся.")) return;
   setClearing(true); setOperationError("");
   try { const bytes = await clearPreviewCache(); if (alive.current) s.set({ cacheMB: bytes / 1048576 }); }
   catch { if (alive.current) setOperationError("Не удалось очистить кэш. Исходные клипы не изменены."); }
   finally { if (alive.current) setClearing(false); }
 };
 const tc=themeCopy[s.language] ?? { theme:"Theme", light:"Light", dark:"Dark" };
  return <div className="pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-foreground"><header className="px-5 pb-6 pt-5"><p className="text-[11px] uppercase tracking-[.18em] text-muted-foreground">MULTI-CAM POV</p><h1 className="text-3xl font-semibold">{t.title}</h1></header><main className="mx-auto max-w-2xl space-y-4 px-4">
  <Group title={tc.theme}><div className="p-3"><div className="theme-seg" role="radiogroup" aria-label={tc.theme}><Button variant="ghost" role="radio" aria-checked={s.theme==="light"} className={s.theme==="light"?"active":""} onClick={()=>s.set({theme:"light"})}><Sun/>{tc.light}</Button><Button variant="ghost" role="radio" aria-checked={s.theme==="dark"} className={s.theme==="dark"?"active":""} onClick={()=>s.set({theme:"dark"})}><Moon/>{tc.dark}</Button></div></div></Group>
  <Group help="language" title={t.language}><label className="settings-item"><span className="flex items-center gap-3"><Globe2 className="text-primary"/> {t.language}</span><select value={s.language} onChange={(e)=>s.set({language:e.target.value})} className="max-w-44 bg-transparent text-end text-sm text-muted-foreground outline-none">{languages.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select></label></Group>
 <Group help="network" title={t.network}><div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border"><Stat label={tr("latency").toUpperCase()} value={`${s.diagnostics.latency} ms`} /><Stat label={tr("status")} value={s.diagnostics.online?"LOCAL":"OFFLINE"}/><Stat label={tr("bandwidth")} value={`${s.diagnostics.bandwidth} Mb/s`}/></div><div className="settings-item"><span className="flex items-center gap-3"><Activity className="text-status"/> {tr("meshNodes")} · {peers.length+1} · {mesh.localId??s.sessionCode}</span><Button size="sm" variant="secondary" disabled={checking} onClick={()=>void diagnose()}>{checking?tr("testing"):tr("runTest")}</Button></div></Group>
 <Group help="cache" title={t.storage}><div className="settings-item"><span className="flex items-center gap-3"><HardDrive className="text-primary"/><span>{tr("offlineCache")}<small className="block text-xs text-muted-foreground">{s.cacheMB.toFixed(2)} MB · превью</small></span></span><Button size="sm" variant="secondary" disabled={clearing} onClick={()=>void clearCache()}><Trash2/>{t.clear}</Button></div></Group>
 <Group help="hwaccel" title={t.engine}><label className="settings-item"><span className="flex items-center gap-3"><Gauge className="text-primary"/><span>{tr("hwAccel")}<small className="block text-xs text-muted-foreground">{tr("hwAccelSub")}</small></span></span><Switch checked={s.hardwareAcceleration} onCheckedChange={(hardwareAcceleration)=>s.set({hardwareAcceleration})}/></label><button className="settings-item w-full" onClick={()=>s.resetProject()}><span className="flex items-center gap-3"><RotateCcw className="text-warning"/>{tr("resetProject")}</span><ChevronRight className="text-muted-foreground"/></button></Group>
 <Group><button className="settings-item w-full" onClick={()=>setPrivacy(true)}><span className="flex items-center gap-3"><ShieldCheck className="text-primary"/>{t.privacy}</span><ChevronRight className="text-muted-foreground"/></button></Group>
 {operationError && <p role="alert" className="text-sm text-destructive">{operationError}</p>}</main><AnimatePresence>{privacy&&<motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-x-0 top-[calc(3.6rem+env(safe-area-inset-top))] bottom-[var(--nav-h)] z-30 flex flex-col overflow-hidden bg-background"><header className="flex shrink-0 items-center justify-between border-b border-border bg-card px-5 py-4"><div><p className="text-[10px] uppercase tracking-[.18em] text-muted-foreground">{tr("legal")}</p><h2 className="text-xl font-semibold">{t.privacy}</h2></div><Button size="icon" variant="ghost" aria-label={tr("close")} onClick={()=>setPrivacy(false)}><X/></Button></header><div className="mx-auto min-h-0 w-full max-w-2xl flex-1 overflow-y-auto overscroll-contain px-6 py-10"><div className="min-h-[65dvh] rounded-lg border border-dashed border-border bg-card p-6" /></div></motion.div>}</AnimatePresence></div>;
}
function Group({title,help,children}:{title?:string;help?:string;children:ReactNode}){return <section><h2 className="mb-2 flex items-center gap-1 px-3 text-xs font-semibold uppercase text-muted-foreground">{title}{help&&<HelpDot id={help}/>}</h2><div className="overflow-hidden rounded-lg bg-card">{children}</div></section>}
function Stat({label,value}:{label:string;value:string}){return <div className="bg-card p-3 text-center"><p className="text-[9px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>}
