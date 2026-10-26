import { renderActiveEditor } from "@/lib/editor-render-bridge";
import { downloadBlob } from "@/lib/downloads";
import { EditorPro } from "./EditorPro";
import { HelpDot } from "./Help";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Captions, ChevronLeft, Download, Gauge, KeyRound, Layers3, Pause, Play, Scissors, SlidersHorizontal, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { downloadProjectZip, downloadText } from "@/lib/downloads";
import { useMulticamStore } from "@/lib/multicam-store";
import { useT } from "@/lib/i18n";

const luts = ["Neutral", "Kodak 2383", "Fuji Eterna", "Teal & Orange", "Bleach Bypass", "Noir", "Warm Chrome", "Arctic", "Vintage 70", "Pastel", "Cinema Green", "Amber Night", "Mono Soft", "Desert", "Clean Log"];
const transitions = ["Dissolve", "Fade B/W", "Wipe", "Zoom", "Blur", "Slide", "Spin", "Glitch", "Flip", "Flash"];
const frequencies = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];

export function EditorTab() {
  const s = useMulticamStore(); const { t } = useT();
  return <div className="editor-fold-workspace pb-[calc(6.5rem+env(safe-area-inset-bottom))] text-foreground">
    <EditorPro chroma={<ChromaPanel />} audio={<AudioPanel />} />
    <AnimatePresence>{s.exportOpen && <ExportDrawer />}</AnimatePresence>
  </div>;
}

function ChromaPanel() {
  const s = useMulticamStore(); const { t } = useT();
  return <div className="grid gap-3"><label className="flex items-center justify-between gap-3 py-1.5"><span>{t("chroma")} <input type="color" value={s.chromaColor} onChange={(e) => s.set({ chromaColor: e.target.value })} /></span><Switch checked={s.chromaEnabled} onCheckedChange={(chromaEnabled) => s.set({ chromaEnabled })} /></label><MiniSlider label={<span className="flex items-center gap-1">{t("tolerance")}<HelpDot id="chromaTol" /></span>} value={s.chromaTolerance} min={0} max={100} onChange={(chromaTolerance) => s.set({ chromaTolerance })} /><MiniSlider label={<span className="flex items-center gap-1">{t("smoothness")}<HelpDot id="chromaSmooth" /></span>} value={s.chromaSmoothness} min={0} max={100} onChange={(chromaSmoothness) => s.set({ chromaSmoothness })} /></div>;
}
function AudioPanel() {
  const s = useMulticamStore(); const { t } = useT();
  return <div><div className="w-full overflow-hidden rounded-md bg-timeline"><div className="grid w-full grid-cols-10 gap-0 px-0.5 py-2">{s.eq.map((value, i) => <label key={frequencies[i]} className="flex min-w-0 flex-col items-center gap-2"><span className="text-[8px] leading-none text-muted-foreground">{frequencies[i]}</span><input aria-label={`${frequencies[i]} Hz EQ`} type="range" min={-12} max={12} value={value} onChange={(e) => s.setEqBand(i, Number(e.target.value))} className="eq-fader" /><span className="font-mono text-[8px] leading-none">{value}</span></label>)}</div></div><div className="mt-2 grid gap-1 divide-y divide-border/50"><label className="flex items-center justify-between gap-3 py-1.5"><span className="flex items-center gap-1">{t("deEsser")}<HelpDot id="deEsser" /></span> <Switch checked={s.deEsser} onCheckedChange={(deEsser) => s.set({ deEsser })} /></label><label className="flex items-center justify-between gap-3 py-1.5"><span className="flex items-center gap-1">{t("autoGain")}<HelpDot id="autoGain" /></span> <Switch checked={s.autoGain} onCheckedChange={(autoGain) => s.set({ autoGain })} /></label><MiniSlider label={t("noise")} value={s.noiseReduction} min={0} max={100} onChange={(noiseReduction) => s.set({ noiseReduction })} /></div></div>;
}

function ExportDrawer() {
  const s = useMulticamStore(); const { t } = useT(); const cfg = s.exportConfig;
  const change = (patch: Partial<typeof cfg>) => s.set({ exportConfig: { ...cfg, ...patch } });
  const [renderError,setRenderError] = useState("");
  const [busy,setBusy] = useState(false);
  const render = async () => {
    if (busy) return;
    setBusy(true); setRenderError(""); s.set({exportProgress:0});
    const abort=new AbortController();
    try {
      const file=await renderActiveEditor(cfg,abort.signal,
        percent => s.set({exportProgress:percent}));
      if (file.blob.size < 1024) throw new Error("Экспортированный файл пуст");
      downloadBlob(file.blob,file.filename);
      s.set({exportProgress:100});
    } catch(e) {
      s.set({exportProgress:0});
      setRenderError(e instanceof Error?e.message:"Не удалось экспортировать видео");
    } finally { setBusy(false); }
  };
  const snapshot = { markers: s.markers, cuts: s.cuts, subtitles: s.subtitles, lut: s.selectedLut, export: cfg };
  return <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 280 }} className="fixed inset-0 z-50 overflow-y-auto bg-background p-4"><div className="mx-auto max-w-xl"><div className="mb-6 flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{t("deliver")}</p><h2 className="text-2xl font-semibold">{t("exportProject")}</h2></div><Button size="icon" variant="ghost" onClick={() => s.set({ exportOpen: false })}><X /></Button></div><div className="mb-5 grid grid-cols-3 gap-2"><Button variant="outline" onClick={() => s.applyPreset("cinema")}>4K Cinema</Button><Button variant="outline" onClick={() => s.applyPreset("reels")}>Reels 60</Button><Button variant="outline" onClick={() => s.applyPreset("draft")}>Fast Draft</Button></div><div className="grid gap-3 sm:grid-cols-2">{[["Aspect",cfg.aspect,["16:9","9:16","1:1","21:9"]],["Resolution",cfg.resolution,["360p","720p","1080p","2K","4K"]],["FPS",cfg.fps,["24","25","30","48","50","60"]],["Video codec",cfg.videoCodec,["H.264","H.265/HEVC","VP8","VP9","AV1"]],["Audio codec",cfg.audioCodec,["AAC","MP3","Opus","FLAC","WAV"]],["Sample rate",cfg.sampleRate,["22.05kHz","44.1kHz","48kHz","96kHz"]]].map(([label,value,values]) => <div key={label as string}><p className="mb-1 text-xs text-muted-foreground">{t(({Aspect:"aspect",Resolution:"resolution",FPS:"fps","Video codec":"videoCodec","Audio codec":"audioCodec","Sample rate":"sampleRate"} as const)[label as "Aspect"])}</p><ModeSelect value={value as string} values={values as string[]} onChange={(v) => change({ [label === "Aspect" ? "aspect" : label === "Resolution" ? "resolution" : label === "FPS" ? "fps" : label === "Video codec" ? "videoCodec" : label === "Audio codec" ? "audioCodec" : "sampleRate"]: v })} /></div>)}<MiniSlider label={`${t("bitrate")} · ${cfg.bitrate} Mbps`} value={cfg.bitrate} min={1.5} max={120} step={.5} onChange={(bitrate) => change({ bitrate })} /><MiniSlider label={`${t("audioBr")} · ${cfg.audioBitrate} kbps`} value={cfg.audioBitrate} min={64} max={320} onChange={(audioBitrate) => change({ audioBitrate })} /></div>{s.exportProgress > 0 && <div className="my-5"><div className="mb-1 flex justify-between text-xs"><span>{t("localRender")}</span><span>{s.exportProgress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full bg-primary transition-all" style={{ width: `${s.exportProgress}%` }} /></div></div>}<Button className="mt-5 w-full" size="lg" disabled={busy} onClick={() => void render()}><Gauge />{busy?"Экспорт…":"Экспортировать видео"}</Button><p className="mt-2 text-xs text-muted-foreground">Для одного неизменённого клипа скачивается оригинал. Для монтажа одного клипа выберите VP8: WebM-рендер с обрезкой, скоростью, базовым фильтром, титрами и звуком (до 120 с, ограничение устройства). Несколько дорожек и другие кодеки пока не поддерживаются.</p>{renderError && <p role="alert" className="mt-2 text-xs text-destructive">{renderError}</p>}<div className="mt-3 grid grid-cols-3 gap-2"><Button variant="secondary" onClick={() => downloadText("multicam.edl", s.cuts.map((c,i) => `${i+1} AX V C ${c.time.toFixed(3)} CAM${c.camera}`).join("\n"))}>EDL</Button><Button variant="secondary" onClick={() => downloadText("multicam.xml", `<project>${s.cuts.map((c) => `<cut time="${c.time}" camera="${c.camera}"/>`).join("")}</project>`, "application/xml")}>XML</Button><Button variant="secondary" onClick={() => void downloadProjectZip(snapshot)}>ZIP</Button></div></div></motion.div>;
}
function MiniSlider({ label, value, min, max, step = 1, onChange }: { label: React.ReactNode; value: number; min: number; max: number; step?: number; onChange:(v:number)=>void }) { return <div><div className="mb-2 flex justify-between text-xs"><span>{label}</span><span>{value}</span></div><Slider value={[value]} min={min} max={max} step={step} onValueChange={([v = value]) => onChange(v)} /></div>; }
function ModeSelect({ value, values, onChange }: { value:string; values:string[]; onChange:(v:string)=>void }) { return <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 w-full rounded-md border border-border bg-secondary px-3 text-xs outline-none">{values.map((v)=><option key={v}>{v}</option>)}</select>; }
