import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Captions, ChevronDown, FilePlus2, ListVideo, ListMusic, Crop, Check, Minus, Pause, Play, Plus, Rewind, Scissors, SkipBack, SkipForward, Trash2, Type, Unlink, Eye, EyeOff, Volume2, VolumeX, X, ScrollText, Pin, PinOff, Blend, RectangleHorizontal } from "lucide-react";
import { useMulticamStore } from "@/lib/multicam-store";
import { HelpDot } from "./Help";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface StoredClip { id: string; createdAt: number; camera: number; playbackRate?: number; blob: Blob; kind?: "video" | "audio"; name?: string }
interface Media { id: string; camera: number; kind: "video" | "audio"; name: string; url: string; duration: number; peaks: number[] }
interface CropBox { x: number; y: number; w: number; h: number }
const FULL_CROP: CropBox = { x: 0, y: 0, w: 100, h: 100 };
interface Item { id: string; mediaId: string; kind: "video" | "audio"; track: number; start: number; in: number; out: number; speed: number; reverse: boolean; scale: number; posX: number; opacity: number; look: string; crop?: CropBox | undefined; color?: ColorAdj }
interface Overlay { id: string; text: string; x: number; y: number; size: number; color: string; bg: boolean; font: string; start: number; end: number; subtitle: boolean }
const COLOR_KEYS = [["temperature", "Температура", "cTemperature"], ["tint", "Оттенок", "cTint"], ["vibrance", "Вибрация", "cVibrance"], ["saturation", "Насыщение", "cSaturation"], ["exposure", "Воздействие", "cExposure"], ["brightness", "Яркость", "cBrightness"], ["contrast", "Контрастность", "cContrast"], ["highlights", "Светлые участки", "cHighlights"], ["shadows", "Тень", "cShadows"], ["whites", "Белый", "cWhites"], ["blacks", "Черный", "cBlacks"], ["hue", "Тон", "cHue"], ["gamma", "Гамма", "cGamma"]] as const;
type ColorKey = typeof COLOR_KEYS[number][0];
type ColorAdj = Record<ColorKey, number>;
const ZERO_COLOR = Object.fromEntries(COLOR_KEYS.map(([k]) => [k, 0])) as ColorAdj;
interface Transition { id: string; track: number; aId: string; bId: string; type: string; dur: number }
const TRANSITION_CATS: { id: string; label: string; items: [string, string][] }[] = [
  { id: "basic", label: "Базовые", items: [["dissolve", "Растворение"], ["fade", "Затемнение"], ["flash", "Вспышка"], ["white", "В белое"], ["desat", "Обесцвечивание"], ["dim", "Приглушение"]] },
  { id: "motion", label: "Движение", items: [["slide", "Сдвиг"], ["wipe", "Шторка"], ["zoom", "Зум"], ["slideV", "Сдвиг вверх"], ["wipeV", "Шторка верт."], ["zoomOut", "Отдаление"]] },
  { id: "fx", label: "Эффекты", items: [["blur", "Размытие"], ["glitch", "Глитч"], ["spin", "Вращение"], ["shake", "Тряска"], ["invert", "Негатив"], ["rainbow", "Радуга"]] },
  { id: "shape", label: "Фигуры", items: [["iris", "Круг"], ["diamond", "Ромб"], ["doors", "Двери"], ["doorsV", "Двери верт."], ["corner", "Угол"], ["diagonal", "Диагональ"]] },
  { id: "3d", label: "Объём", items: [["flip", "Переворот"], ["flipV", "Переворот верт."], ["cube", "Куб"], ["tilt", "Наклон"], ["swing", "Качели"], ["fold", "Сгиб"]] },
];
const TR_NAME: Record<string, string> = Object.fromEntries(TRANSITION_CATS.flatMap((c) => c.items));
/** Tone curve sampled into an SVG feComponentTransfer table. */
function toneTable(c: ColorAdj) {
  const pts: string[] = [];
  for (let k = 0; k <= 16; k++) {
    let x = k / 16;
    x *= Math.pow(2, c.exposure / 50);
    x += c.brightness / 200;
    x = (x - 0.5) * (1 + c.contrast / 100) + 0.5;
    x += (c.shadows / 250) * (1 - x) * (1 - x);
    x += (c.highlights / 250) * x * x;
    x += (c.blacks / 300) * Math.pow(Math.max(0, 1 - x), 4);
    x += (c.whites / 300) * Math.pow(Math.max(0, x), 4);
    x = Math.min(1, Math.max(0, x));
    x = Math.pow(x, 1 / (1 + c.gamma / 125));
    pts.push(x.toFixed(4));
  }
  return pts.join(" ");
}
function ColorFilterDef({ id, c }: { id: string; c: ColorAdj }) {
  const r = 1 + c.temperature * 0.003, b = 1 - c.temperature * 0.003, g = 1 - c.tint * 0.002;
  const table = toneTable(c);
  return <filter id={id} colorInterpolationFilters="sRGB">
    <feColorMatrix type="matrix" values={`${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`} />
    <feColorMatrix type="saturate" values={String(Math.max(0, 1 + c.saturation / 100 + c.vibrance / 160))} />
    <feColorMatrix type="hueRotate" values={String(c.hue * 1.8)} />
    <feComponentTransfer><feFuncR type="table" tableValues={table} /><feFuncG type="table" tableValues={table} /><feFuncB type="table" tableValues={table} /></feComponentTransfer>
  </filter>;
}

type Fx = Pick<Item, "speed" | "reverse" | "scale" | "posX" | "opacity" | "look">;

const LOOKS: Record<string, string> = { "Без цвета": "none", Тёплый: "sepia(.25) saturate(1.2)", Холодный: "hue-rotate(190deg) saturate(.9)", "Ч/Б": "grayscale(1) contrast(1.1)", Кино: "contrast(1.15) saturate(.85) brightness(.95)", Яркий: "saturate(1.5) contrast(1.05)", "LOG → Rec709": "contrast(1.35) saturate(1.3)" };
const FONT_NAMES = ["Montserrat","Roboto","Open Sans","Raleway","Nunito","Rubik","Manrope","Jost","Exo 2","Ubuntu","Fira Sans","IBM Plex Sans","PT Sans","PT Serif","Playfair Display","Lora","Merriweather","Cormorant Garamond","Alice","Yeseva One","Oswald","Russo One","Unbounded","Comfortaa","Philosopher","Lobster","Pacifico","Caveat","Marck Script","Press Start 2P"];
export const FONTS = FONT_NAMES.map((f) => `"${f}", sans-serif`);
const ASPECTS: [string, string, number][] = [["16:9", "YouTube", 16 / 9], ["9:16", "Reels / TikTok", 9 / 16], ["1:1", "Квадрат", 1], ["4:3", "Классика", 4 / 3], ["4:5", "Instagram", 4 / 5], ["21:9", "Кино", 21 / 9]];
const ROW = 44; const FRAME = 1 / 30; const HEAD = 72; const TILE = 64;
const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
const len = (i: Item) => (i.out - i.in) / i.speed;
const fmt = (t: number) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;

function saveClip(clip: StoredClip): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("multicam-pov-media", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("clips", { keyPath: "id" });
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { const tx = req.result.transaction("clips", "readwrite"); tx.objectStore("clips").put(clip); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); };
  });
}
function readClips(): Promise<StoredClip[]> {
  return new Promise((resolve) => {
    const req = indexedDB.open("multicam-pov-media", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("clips", { keyPath: "id" });
    req.onerror = () => resolve([]);
    req.onsuccess = () => { const all = req.result.transaction("clips").objectStore("clips").getAll(); all.onsuccess = () => resolve(all.result as StoredClip[]); all.onerror = () => resolve([]); };
  });
}
const analysisCache = new Map<string, { duration: number; peaks: number[] }>();
const thumbCache = new Map<string, string[]>();
/** Extracts evenly spaced JPEG frames for the filmstrip; cached per clip id. */
async function makeThumbs(url: string, duration: number, n = 10): Promise<string[]> {
  const v = document.createElement("video"); v.muted = true; v.preload = "auto"; v.playsInline = true; v.src = url;
  await new Promise<void>((res) => { v.onloadeddata = () => res(); v.onerror = () => res(); window.setTimeout(res, 4000); });
  if (!v.videoWidth || !v.videoHeight) return [];
  const c = document.createElement("canvas"); c.height = 54; c.width = Math.round((54 * v.videoWidth) / v.videoHeight);
  const ctx = c.getContext("2d"); if (!ctx) return [];
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    const time = Math.min(Math.max(0, duration - 0.05), ((k + 0.5) * duration) / n);
    await new Promise<void>((res) => { let done = false; const fin = () => { if (done) return; done = true; v.removeEventListener("seeked", fin); res(); }; v.addEventListener("seeked", fin); v.currentTime = time; window.setTimeout(fin, 1500); });
    ctx.drawImage(v, 0, 0, c.width, c.height); out.push(c.toDataURL("image/jpeg", 0.6));
  }
  v.removeAttribute("src"); v.load();
  return out;
}
async function analyse(clip: StoredClip): Promise<Media> {
  const url = URL.createObjectURL(clip.blob);
  const cached = analysisCache.get(clip.id);
  if (cached) return { id: clip.id, camera: clip.camera ?? 1, kind: clip.kind ?? "video", name: clip.name ?? "", url, duration: cached.duration, peaks: cached.peaks };
  const duration = await new Promise<number>((res) => { const v = document.createElement("video"); v.preload = "metadata"; v.src = url; v.onloadedmetadata = () => { if (Number.isFinite(v.duration)) res(v.duration); else { v.currentTime = 1e7; v.ontimeupdate = () => { v.ontimeupdate = null; res(v.duration || 1); }; } }; v.onerror = () => res(1); });
  let peaks: number[] = [];
  try {
    const ctx = new OfflineAudioContext(1, 44100, 44100);
    const buf = await ctx.decodeAudioData(await clip.blob.arrayBuffer());
    const data = buf.getChannelData(0); const n = Math.max(20, Math.round(duration * 20)); const step = Math.floor(data.length / n) || 1;
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < (i + 1) * step && j < data.length; j++) m = Math.max(m, Math.abs(data[j]!)); peaks.push(m); }
  } catch { peaks = []; }
  analysisCache.set(clip.id, { duration, peaks });
  return { id: clip.id, camera: clip.camera ?? 1, kind: clip.kind ?? "video", name: clip.name ?? "", url, duration: duration * (clip.playbackRate && clip.playbackRate > 1 ? 1 : 1), peaks };
}

export function EditorPro({ chroma, audio }: { chroma?: ReactNode; audio?: ReactNode }) {
  const [media, setMedia] = useState<Media[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [muted, setMuted] = useState<Record<string, boolean>>({});
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [thumbs, setThumbs] = useState<Record<string, string[]>>({});
  const [panel, setPanel] = useState<"transitions" | "color" | "audio" | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const urlsRef = useRef<Set<string>>(new Set());
  const rulerRef = useRef<HTMLDivElement>(null);
  const setStore = useMulticamStore((x) => x.set); const mediaOpen = useMulticamStore((x) => x.mediaOpen); const setMediaOpen = (mediaOpen: boolean) => setStore({ mediaOpen });
  const [zoom, setZoom] = useState(8);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [subState, setSubState] = useState<"off" | "working" | "on">("off");
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => { setLoading(true); const clips = await readClips(); clips.sort((a, b) => a.createdAt - b.createdAt); setMedia(await Promise.all(clips.map(analyse))); setLoading(false); }, []);
  useEffect(() => { void load(); const on = () => void load(); window.addEventListener("multicam-clips-changed", on); return () => window.removeEventListener("multicam-clips-changed", on); }, [load]);
  useEffect(() => { const now = new Set(media.map((m) => m.url)); urlsRef.current.forEach((u) => { if (!now.has(u)) URL.revokeObjectURL(u); }); urlsRef.current = now; }, [media]);
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      for (const m of media) {
        if (m.kind !== "video") continue;
        let th = thumbCache.get(m.id);
        if (!th) { th = await makeThumbs(m.url, m.duration); if (th.length) thumbCache.set(m.id, th); }
        if (!alive) return;
        const frames = th;
        setThumbs((cur) => cur[m.id] === frames ? cur : { ...cur, [m.id]: frames });
      }
    })();
    return () => { alive = false; };
  }, [media]);
  useEffect(() => { setStore({ exportMix: { excludedAudio: Object.keys(muted).filter((k) => muted[k]), hiddenVideo: Object.keys(hidden).filter((k) => hidden[k]) } }); }, [muted, hidden, setStore]);

  const total = useMemo(() => Math.max(10, ...items.map((i) => i.start + len(i))), [items]);
  const first = useMemo(() => items.length ? Math.min(...items.map((i) => i.start)) : 0, [items]);
  useEffect(() => { setT((v) => v < first ? first : v); }, [first]);
  const [aspOpen, setAspOpen] = useState(false); const [snap, setSnap] = useState<{ v: boolean; h: boolean }>({ v: false, h: false }); const tlRef = useRef<HTMLDivElement>(null); const [tlW, setTlW] = useState(0);
  useEffect(() => { const el = tlRef.current; if (!el) return; const ro = new ResizeObserver(() => setTlW(el.clientWidth)); ro.observe(el); setTlW(el.clientWidth); return () => ro.disconnect(); }, []);
  const [vTracks, setVTracks] = useState(1); const [aTracks, setATracks] = useState(1);
  const [transitions, setTransitions] = useState<Transition[]>([]); const [selTr, setSelTr] = useState<string | null>(null);
  const [trCat, setTrCat] = useState("basic"); const [ghost, setGhost] = useState<{ type: string; x: number; y: number } | null>(null); const [dropErr, setDropErr] = useState("");
  const [pinMon, setPinMon] = useState(false); const [pinTl, setPinTl] = useState(false); const [headerH, setHeaderH] = useState(0); const [monH, setMonH] = useState(0);
  const monRef = useRef<HTMLDivElement>(null); const laneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [cropFor, setCropFor] = useState<string | null>(null); const [cropDraft, setCropDraft] = useState<CropBox | null>(null); const [addOpen, setAddOpen] = useState(false); const [importErr, setImportErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null); const pendingRef = useRef<{ id: string; track: number } | null>(null);
  useEffect(() => {
    const h = document.querySelector<HTMLElement>(".app-header"); const m = monRef.current;
    const measure = () => { setHeaderH(h?.offsetHeight ?? 0); setMonH(m?.offsetHeight ?? 0); };
    measure(); const ro = new ResizeObserver(measure); if (h) ro.observe(h); if (m) ro.observe(m); return () => ro.disconnect();
  }, []);
  const mediaById = useMemo(() => new Map(media.map((m) => [m.id, m])), [media]);

  const addMedia = (m: Media, forceTrack?: number) => setItems((cur) => {
    const max = m.kind === "audio" ? aTracks : vTracks;
    const track = Math.min(max, Math.max(1, forceTrack ?? m.camera));
    const end = Math.max(0, ...cur.filter((i) => i.kind === m.kind && i.track === track).map((i) => i.start + len(i)));
    return [...cur, { id: uid(), mediaId: m.id, kind: m.kind, track, start: end, in: 0, out: m.duration, speed: 1, reverse: false, scale: 100, posX: 0, opacity: 100, look: "Без цвета" }];
  });

  useEffect(() => {
    const p = pendingRef.current; if (!p) return;
    const m = media.find((x) => x.id === p.id); if (!m) return;
    pendingRef.current = null; addMedia(m, p.track);
  }, [media]);
  const importFile = async (file?: File) => {
    setAddOpen(false); setImportErr(""); if (!file) return;
    const kind = file.type.startsWith("audio") ? "audio" : file.type.startsWith("video") ? "video" : null;
    if (!kind) { setImportErr("Поддерживаются только видео и аудио файлы"); return; }
    const track = selItem && selItem.kind === kind ? selItem.track : 1;
    const id = `import-${Date.now()}`;
    try { await saveClip({ id, createdAt: Date.now(), camera: track, blob: file, kind, name: file.name }); pendingRef.current = { id, track }; window.dispatchEvent(new Event("multicam-clips-changed")); }
    catch { setImportErr("Не удалось сохранить файл в хранилище"); }
  };

  // Playback: always starts from 00:00 of the track and advances frame-accurately.
  useEffect(() => {
    if (!playing) return;
    let raf = 0; let last = performance.now();
    const tick = (now: number) => { const dt = (now - last) / 1000; last = now; setT((v) => { const n = v + dt; if (n >= total) { setPlaying(false); return total; } return n; }); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [playing, total, first]);

  const active = useMemo(() => [...items].filter((i) => i.kind === "video" && !hidden[`v${i.track}`] && t >= i.start && t < i.start + len(i)).sort((a, b) => a.track - b.track)[0] ?? null, [items, t, hidden]);
  /** Items whose sound is heard: audio clips on unmuted lanes, and video clips with attached (not detached) audio on unmuted lanes. Visibility does not affect sound. */
  const audible = useMemo(() => items.filter((i) => i.kind === "audio" ? !muted[`a${i.track}`] : !muted[`v${i.track}`] && !items.some((a) => a.kind === "audio" && a.mediaId === i.mediaId)), [items, muted]);

  const validTr = useMemo(() => transitions.filter((tr) => { const a = items.find((i) => i.id === tr.aId); const b = items.find((i) => i.id === tr.bId); return a && b && a.kind === "video" && b.kind === "video" && a.track === tr.track && b.track === tr.track && Math.abs(a.start + len(a) - b.start) < 0.15; }), [transitions, items]);
  const trStyle = useMemo<{ filter: string; transform: string; opacity: number; clip?: string }>(() => {
    const none = { filter: "", transform: "", opacity: 1 };
    if (!active) return none;
    for (const tr of validTr) {
      if (tr.track !== active.track) continue; const b = items.find((i) => i.id === tr.bId); if (!b) continue;
      const p = (t - (b.start - tr.dur / 2)) / tr.dur; if (p < 0 || p > 1) continue;
      const k = 1 - Math.abs(2 * p - 1); const dir = p < 0.5 ? -1 : 1;
      switch (tr.type) {
        case "dissolve": return { ...none, opacity: 1 - k * 0.7 };
        case "fade": return { ...none, opacity: 1 - k };
        case "flash": return { ...none, filter: `brightness(${1 + k * 3})` };
        case "slide": return { ...none, transform: `translateX(${dir * k * 40}%)` };
        case "wipe": return { ...none, clip: p < 0.5 ? `inset(0 ${k * 100}% 0 0)` : `inset(0 0 0 ${k * 100}%)` };
        case "zoom": return { ...none, transform: `scale(${1 + k * 0.5})` };
        case "blur": return { ...none, filter: `blur(${k * 14}px)` };
        case "glitch": return { ...none, filter: `hue-rotate(${k * 180}deg) saturate(${1 + k * 2})`, transform: `translateX(${(Math.round(t * 30) % 2 ? 1 : -1) * k * 6}%)` };
        case "spin": return { ...none, transform: `rotate(${dir * k * 180}deg) scale(${1 - k * 0.3})` };
        case "white": return { ...none, filter: `brightness(${1 + k * 2.5}) saturate(${1 - k})` };
        case "desat": return { ...none, filter: `grayscale(${k})` };
        case "dim": return { ...none, filter: `brightness(${1 - k * 0.65}) contrast(${1 + k * 0.3})` };
        case "slideV": return { ...none, transform: `translateY(${dir * k * 40}%)` };
        case "wipeV": return { ...none, clip: p < 0.5 ? `inset(0 0 ${k * 100}% 0)` : `inset(${k * 100}% 0 0 0)` };
        case "zoomOut": return { ...none, transform: `scale(${1 - k * 0.45})` };
        case "shake": { const f = Math.round(t * 30); return { ...none, transform: `translate(${(f % 2 ? 1 : -1) * k * 5}%, ${(f % 3 ? 1 : -1) * k * 4}%)` }; }
        case "invert": return { ...none, filter: `invert(${k})` };
        case "rainbow": return { ...none, filter: `hue-rotate(${k * 360}deg) saturate(${1 + k})` };
        case "iris": return { ...none, clip: `circle(${(1 - k) * 75}% at 50% 50%)` };
        case "diamond": { const r = (1 - k) * 100; return { ...none, clip: `polygon(50% ${50 - r}%, ${50 + r}% 50%, 50% ${50 + r}%, ${50 - r}% 50%)` }; }
        case "doors": return { ...none, clip: `inset(0 ${k * 50}% 0 ${k * 50}%)` };
        case "doorsV": return { ...none, clip: `inset(${k * 50}% 0 ${k * 50}% 0)` };
        case "corner": return { ...none, clip: `inset(0 ${k * 100}% ${k * 100}% 0)` };
        case "diagonal": { const d = (1 - k) * 200; return { ...none, clip: `polygon(0 0, ${d}% 0, 0 ${d}%)` }; }
        case "flip": return { ...none, transform: `perspective(700px) rotateY(${dir * k * 90}deg)` };
        case "flipV": return { ...none, transform: `perspective(700px) rotateX(${dir * k * 90}deg)` };
        case "cube": return { ...none, transform: `perspective(700px) translateX(${dir * k * 30}%) rotateY(${dir * k * 60}deg)` };
        case "tilt": return { ...none, transform: `rotate(${dir * k * 15}deg) scale(${1 + k * 0.25})` };
        case "swing": return { ...none, transform: `perspective(700px) rotateY(${dir * k * 45}deg) rotateZ(${dir * k * 6}deg)` };
        case "fold": return { ...none, transform: `scaleX(${1 - k * 0.95})` };
      }
    }
    return none;
  }, [active, validTr, items, t]);

  // Native playback while playing (no per-frame seeking); seeks only for scrubbing, reverse, or drift > 0.3 s.
  useEffect(() => {
    const v = videoRef.current; if (!v || !active) return;
    const m = mediaById.get(active.mediaId); if (!m) return;
    if (v.dataset["src"] !== m.url) { v.dataset["src"] = m.url; v.src = m.url; }
    v.muted = true;
    const local = (t - active.start) * active.speed;
    const target = Math.max(0, active.reverse ? active.out - local : active.in + local);
    if (playing && !active.reverse) {
      if (v.playbackRate !== active.speed) v.playbackRate = active.speed;
      if (v.paused) { v.currentTime = target; void v.play().catch(() => undefined); }
      else if (Math.abs(v.currentTime - target) > 0.3) v.currentTime = target;
    } else {
      if (!v.paused) v.pause();
      if (!v.seeking && Math.abs(v.currentTime - target) > (playing ? 0.06 : 0.02)) v.currentTime = target;
    }
  }, [active, t, mediaById, playing]);
  useEffect(() => {
    for (const i of audible) {
      const el = audioRefs.current[i.id]; if (!el) continue;
      const inRange = t >= i.start && t < i.start + len(i);
      if (!playing || !inRange || i.reverse) { if (!el.paused) el.pause(); continue; }
      const target = i.in + (t - i.start) * i.speed;
      if (el.playbackRate !== i.speed) el.playbackRate = i.speed;
      if (el.paused) { el.currentTime = target; void el.play().catch(() => undefined); }
      else if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
    }
  }, [t, playing, audible]);

  const selItem = items.find((i) => i.id === selected) ?? null;
  const fx: Fx = selItem ?? items[0] ?? { speed: 1, reverse: false, scale: 100, posX: 0, opacity: 100, look: "Без цвета" };
  const applyFx = (patch: Partial<Fx>) => { if (selected) setItems((cur) => cur.map((i) => i.id === selected ? { ...i, ...patch } : i)); };

  const split = () => setItems((cur) => cur.flatMap((i) => {
    if (!(t > i.start && t < i.start + len(i)) || (selected && i.id !== selected)) return [i];
    const cut = i.in + (t - i.start) * i.speed;
    return [{ ...i, out: cut }, { ...i, id: uid(), in: cut, start: t }];
  }));
  const rippleDelete = () => {
    if (!selItem) return;
    const gap = len(selItem);
    setItems((cur) => cur.filter((i) => i.id !== selItem.id).map((i) => i.kind === selItem.kind && i.track === selItem.track && i.start > selItem.start ? { ...i, start: i.start - gap } : i));
    setSelected(null);
  };
  const deleteSelection = () => { if (selTr) { setTransitions((cur) => cur.filter((x) => x.id !== selTr)); setSelTr(null); } else rippleDelete(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const tag = (e.target as HTMLElement | null)?.tagName; if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; if (e.key === "Delete" || e.key === "Backspace") { if (selTr || selected) { e.preventDefault(); deleteSelection(); } } };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  const detach = () => {
    if (!selItem || selItem.kind !== "video") return;
    const s0 = selItem.start; const e0 = selItem.start + len(selItem);
    if (items.some((i) => i.kind === "audio" && i.mediaId === selItem.mediaId && Math.abs(i.start - s0) < 0.01)) return;
    const free = (n: number) => !items.some((i) => i.kind === "audio" && i.track === n && i.start < e0 && i.start + len(i) > s0);
    const order = [selItem.track, ...Array.from({ length: aTracks }, (_, k) => k + 1).filter((n) => n !== selItem.track)].filter((n) => n <= aTracks);
    let track = order.find(free);
    if (!track) { track = aTracks + 1; setATracks(track); }
    const t2 = track;
    setItems((cur) => [...cur, { ...selItem, id: uid(), kind: "audio", track: t2 }]);
  };
  const startTrDrag = (type: string) => (e: React.PointerEvent) => {
    e.preventDefault(); setDropErr(""); setGhost({ type, x: e.clientX, y: e.clientY });
    const move = (ev: PointerEvent) => setGhost({ type, x: ev.clientX, y: ev.clientY });
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); setGhost(null);
      const entry = Object.entries(laneRefs.current).find(([, el]) => { if (!el) return false; const r = el.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; });
      if (!entry || !entry[0].startsWith("v")) { if (entry || Math.abs(ev.clientX - e.clientX) + Math.abs(ev.clientY - e.clientY) > 10) setDropErr("Отпустите переход на стыке двух видеоклипов"); return; }
      const track = Number(entry[0].slice(1)); const r = entry[1]!.getBoundingClientRect(); const at = (ev.clientX - r.left) / zoom;
      const clips = items.filter((i) => i.kind === "video" && i.track === track).sort((a, b) => a.start - b.start);
      let best: [Item, Item, number] | null = null;
      for (let k = 0; k < clips.length - 1; k++) { const a = clips[k]!, b = clips[k + 1]!; if (Math.abs(a.start + len(a) - b.start) >= 0.15) continue; const d = Math.abs(b.start - at); if (!best || d < best[2]) best = [a, b, d]; }
      if (!best || best[2] > Math.max(1, 30 / zoom)) { setDropErr("Отпустите переход точно между двумя соседними видеоклипами"); return; }
      const [a, b] = best; const dur = Math.min(1, len(a), len(b));
      const tr: Transition = { id: uid(), track, aId: a.id, bId: b.id, type, dur };
      setTransitions((cur) => [...cur.filter((x) => !(x.aId === a.id && x.bId === b.id)), tr]); setSelTr(tr.id); setSelected(null);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const colorOf = (i: Item | null): ColorAdj => ({ ...ZERO_COLOR, ...(i?.color ?? {}) });
  const setColor = (k: ColorKey, v: number) => { if (selItem?.kind === "video") setItems((cur) => cur.map((i) => i.id === selItem.id ? { ...i, color: { ...colorOf(i), [k]: v } } : i)); };

  const generateSubs = async () => {
    if (subState === "on") { setOverlays((o) => o.filter((x) => !x.subtitle)); setSubState("off"); return; }
    if (subState === "working") return;
    setSubState("working");
    await new Promise((r) => setTimeout(r, 30));
    const blocks: Overlay[] = [];
    for (const it of items.filter((i) => i.kind === "video")) {
      const m = mediaById.get(it.mediaId); if (!m?.peaks.length) continue;
      const per = m.duration / m.peaks.length; const thr = Math.max(0.04, Math.max(...m.peaks) * 0.25);
      let startIdx = -1;
      m.peaks.forEach((p, idx) => {
        const loud = p >= thr;
        if (loud && startIdx < 0) startIdx = idx;
        if ((!loud || idx === m.peaks.length - 1) && startIdx >= 0) {
          const s = startIdx * per; const e = (idx + 1) * per; startIdx = -1;
          if (e - s < 0.4 || s < it.in || s > it.out) return;
          blocks.push({ id: uid(), text: `Реплика ${blocks.length + 1}`, x: 50, y: 84, size: 18, color: "#ffffff", bg: true, font: FONTS[0]!, start: it.start + (s - it.in) / it.speed, end: it.start + (e - it.in) / it.speed, subtitle: true });
        }
      });
    }
    setOverlays((o) => [...o.filter((x) => !x.subtitle), ...blocks]);
    setSubState(blocks.length ? "on" : "off");
  };

  const dragOverlay = (id: string) => (e: React.PointerEvent) => {
    const box = previewRef.current?.getBoundingClientRect(); if (!box) return;
    e.stopPropagation(); const sx = e.clientX; const sy = e.clientY; let moved = false;
    const move = (ev: PointerEvent) => { if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) moved = true; if (!moved) return; setOverlays((o) => o.map((x) => x.id === id ? { ...x, x: Math.min(98, Math.max(2, ((ev.clientX - box.left) / box.width) * 100)), y: Math.min(98, Math.max(2, ((ev.clientY - box.top) / box.height) * 100)) } : x)); };
    const up = () => { setSnap({ v: false, h: false }); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); if (!moved) setEditing(id); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const dragItem = (it: Item) => (e: React.PointerEvent) => {
    e.stopPropagation(); const sx = e.clientX; const sy = e.clientY; const orig = { start: it.start, track: it.track }; let moved = false;
    const hold = window.setTimeout(() => { if (!moved) { setSelected(it.id); setSelTr(null); navigator.vibrate?.(30); } }, 450);
    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) { moved = true; window.clearTimeout(hold); }
      if (!moved) return;
      const start = Math.max(0, orig.start + (ev.clientX - sx) / zoom);
      const track = Math.min(it.kind === "audio" ? aTracks : vTracks, Math.max(1, orig.track + Math.round((ev.clientY - sy) / ROW)));
      setItems((cur) => cur.map((x) => x.id === it.id ? { ...x, start, track } : x));
    };
    const up = () => { window.clearTimeout(hold); if (!moved) { setSelected(it.id); setSelTr(null); } window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const editOverlay = overlays.find((o) => o.id === editing) ?? null;
  const patchOverlay = (patch: Partial<Overlay>) => setOverlays((o) => o.map((x) => x.id === editing || (editOverlay?.subtitle && x.subtitle && !("text" in patch)) ? { ...x, ...patch } : x));
  const lanes = [...Array.from({ length: vTracks }, (_, k) => k + 1).map((n) => ({ key: `v${n}`, kind: "video" as const, track: n, label: "Video" })), ...Array.from({ length: aTracks }, (_, k) => k + 1).map((n) => ({ key: `a${n}`, kind: "audio" as const, track: n, label: "Audio" }))];

  const aspect = useMulticamStore((x) => x.aspect);
  const ratio = ASPECTS.find((a) => a[0] === aspect)?.[2] ?? 16 / 9;
  const canvasBox = ratio >= 16 / 9 ? { width: "100%", height: `${(16 / 9 / ratio) * 100}%` } : { height: "100%", width: `${(ratio / (16 / 9)) * 100}%` };
  const cropItem = items.find((i) => i.id === cropFor) ?? null;
  const startCrop = () => { if (selItem?.kind !== "video") return; setPlaying(false); setEditing(null); setCropFor(selItem.id); setCropDraft({ ...(selItem.crop ?? FULL_CROP) }); if (!(t >= selItem.start && t < selItem.start + len(selItem))) setT(selItem.start); };
  const applyCrop = () => { if (cropFor && cropDraft) { const full = cropDraft.x <= 0.01 && cropDraft.y <= 0.01 && cropDraft.w >= 99.99 && cropDraft.h >= 99.99; setItems((cur) => cur.map((i) => i.id === cropFor ? { ...i, crop: full ? undefined : { ...cropDraft } } : i)); } setCropFor(null); setCropDraft(null); };
  const cancelCrop = () => { setCropFor(null); setCropDraft(null); };
    const cropDrag = (mode: string) => (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    const box = previewRef.current?.getBoundingClientRect(); if (!box || !cropDraft) return;
    const start = { ...cropDraft }; const sx = e.clientX; const sy = e.clientY; const MIN = 10;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - sx) / box.width) * 100; const dy = ((ev.clientY - sy) / box.height) * 100;
      let { x, y, w, h } = start;
      if (mode === "move") { x = clamp(x + dx, 0, 100 - w); y = clamp(y + dy, 0, 100 - h); const SN = 2.5; const sv = Math.abs(x + w / 2 - 50) < SN, sh = Math.abs(y + h / 2 - 50) < SN; if (sv) x = 50 - w / 2; if (sh) y = 50 - h / 2; if (x < SN) x = 0; if (y < SN) y = 0; if (100 - x - w < SN) x = 100 - w; if (100 - y - h < SN) y = 100 - h; setSnap({ v: sv, h: sh }); }
      else {
        if (mode.includes("l")) { const nx = clamp(start.x + dx, 0, start.x + start.w - MIN); w = start.w + (start.x - nx); x = nx; }
        if (mode.includes("r")) w = clamp(start.w + dx, MIN, 100 - start.x);
        if (mode.includes("t")) { const ny = clamp(start.y + dy, 0, start.y + start.h - MIN); h = start.h + (start.y - ny); y = ny; }
        if (mode.includes("b")) h = clamp(start.h + dy, MIN, 100 - start.y);
      }
      setCropDraft({ x, y, w, h });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const minZoom = Math.min(600, Math.max(8, tlW > 0 ? (tlW - 8) / total : 8));
  useEffect(() => { setZoom((z) => z < minZoom ? minZoom : z); }, [minZoom]);
  useEffect(() => { if (zoom <= minZoom + 0.01 && tlRef.current) tlRef.current.scrollLeft = 0; }, [zoom, minZoom]);
  const zoomPos = Math.round((Math.log(Math.max(zoom, minZoom) / minZoom) / Math.log(600 / minZoom || 1.0001)) * 100);
  const scrub = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault(); setPlaying(false);
    const at = (x: number) => { const r = rulerRef.current?.getBoundingClientRect(); if (r) setT(Math.min(total, Math.max(0, (x - r.left) / zoom))); };
    at(e.clientX);
    const move = (ev: PointerEvent) => at(ev.clientX);
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  // Lanes do not depend on the playhead, so they are memoised and skipped during 60 fps playback re-renders.
  const laneEls = useMemo(() => lanes.map((lane) => <div key={lane.key} className="relative flex border-b border-border/40" style={{ height: ROW }}>
    <div className="relative flex-1" ref={(el) => { laneRefs.current[lane.key] = el; }}>
      {items.filter((i) => i.track === lane.track && i.kind === lane.kind).map((i) => {
        const m = mediaById.get(i.mediaId); const w = Math.max(6, len(i) * zoom);
        const th = lane.kind === "video" ? thumbs[i.mediaId] : undefined; const n = th?.length && m ? Math.max(1, Math.ceil(w / TILE)) : 0;
        return <div key={i.id} onPointerDown={dragItem(i)} className={`absolute inset-y-1 cursor-grab overflow-hidden rounded [touch-action:none] ${lane.kind === "video" ? "bg-primary/30" : "bg-status/25"} ${selected === i.id ? "ring-2 ring-primary" : ""} ${(lane.kind === "video" ? hidden[lane.key] : muted[lane.key]) ? "opacity-40" : ""}`} style={{ left: i.start * zoom, width: w }}>
          {n > 0 && th && m && <div className="pointer-events-none absolute inset-0 flex">{Array.from({ length: n }, (_, k) => { const frac = (k + 0.5) / n; const src = i.reverse ? i.out - frac * (i.out - i.in) : i.in + frac * (i.out - i.in); const idx = Math.min(th.length - 1, Math.max(0, Math.floor((src / m.duration) * th.length))); return <img key={k} src={th[idx]} alt="" draggable={false} className="h-full shrink-0 object-cover" style={{ width: TILE }} />; })}</div>}
          <svg className={`pointer-events-none absolute inset-x-0 bottom-0 w-full ${n > 0 ? "h-1/3 opacity-70" : "h-full"}`} preserveAspectRatio="none" viewBox="0 0 100 100">{m && m.peaks.length > 0 && (() => { const a = Math.floor((i.in / m.duration) * m.peaks.length); const b = Math.max(a + 1, Math.ceil((i.out / m.duration) * m.peaks.length)); const seg = m.peaks.slice(a, b); if (i.reverse) seg.reverse(); return seg.map((p, k) => <rect key={k} x={(k / seg.length) * 100} width={100 / seg.length * 0.8} y={50 - p * 48} height={Math.max(1, p * 96)} className="fill-foreground/60" />); })()}</svg>
          <span className="relative rounded-br bg-background px-1 text-[8px] font-semibold">{i.speed !== 1 && `${i.speed}× `}{i.reverse && "⟲"}</span>
        </div>; })}
      {lane.kind === "video" && validTr.filter((tr) => tr.track === lane.track).map((tr) => { const b = items.find((i) => i.id === tr.bId)!; return <button key={tr.id} aria-label={`Переход ${TR_NAME[tr.type]}`} title={TR_NAME[tr.type]} onPointerDown={(e) => { e.stopPropagation(); setSelTr(tr.id); setSelected(null); }} className={`absolute top-1/2 z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 rotate-45 items-center justify-center rounded-sm border ${selTr === tr.id ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary" : "border-foreground/60 bg-background"}`} style={{ left: b.start * zoom }}><Blend className="size-3 -rotate-45" /></button>; })}
    </div>
  </div>),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [items, zoom, hidden, muted, selected, selTr, thumbs, mediaById, validTr, vTracks, aTracks]);

  return <section className="mb-2 min-w-0 space-y-2 overflow-x-hidden px-3 pt-2 text-xs">
    <div ref={monRef} className={`${pinMon ? "sticky z-20 -mx-4 bg-background px-4 pb-2 pt-1" : "relative"}`} style={pinMon ? { top: headerH } : undefined}>
    <div className="relative w-full overflow-hidden rounded-lg bg-letterbox" style={{ aspectRatio: "16 / 9" }} onClick={() => { setEditing(null); setAspOpen(false); }}>
    <div ref={previewRef} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-viewfinder" style={canvasBox}>
      {active && <svg className="absolute size-0" aria-hidden><defs><ColorFilterDef id={`cc-${active.id}`} c={colorOf(active)} /></defs></svg>}
      {audible.map((i) => <audio key={i.id} ref={(el) => { audioRefs.current[i.id] = el; }} src={mediaById.get(i.mediaId)?.url} preload="auto" className="hidden" />)}
      {active ? <video ref={videoRef} muted playsInline className="h-full w-full object-cover" style={{ filter: `url(#cc-${active.id}) ${LOOKS[active.look] === "none" ? "" : LOOKS[active.look]} ${trStyle.filter}`, opacity: (active.opacity / 100) * trStyle.opacity, clipPath: trStyle.clip, transform: `translateX(${active.posX}%) scale(${active.scale / 100}) ${trStyle.transform} ${cropFor === active.id ? "" : cropTransform(active.crop)}`, transformOrigin: "50% 50%" }} />
        : <div className="flex h-full items-center justify-center p-4 text-center text-muted-foreground">{loading ? "Загрузка клипов…" : "00:00.00"}</div>}
      {overlays.filter((o) => t >= o.start && t <= o.end).map((o) => <div key={o.id} onPointerDown={dragOverlay(o.id)} onClick={(e) => e.stopPropagation()} className={`absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 cursor-move select-none rounded px-2 py-0.5 text-center font-semibold [touch-action:none] ${editing === o.id ? "ring-2 ring-primary" : ""}`} style={{ left: `${o.x}%`, top: `${o.y}%`, fontSize: o.size, color: o.color, fontFamily: o.font, background: o.bg ? "rgb(0 0 0 / .55)" : "transparent" }}>{o.text}</div>)}
      {cropDraft && cropItem && <div className="absolute inset-0 z-20 [touch-action:none]" onClick={(e) => e.stopPropagation()}>
        <div className="absolute border-2 border-primary shadow-[0_0_0_9999px_oklch(0_0_0/0.6)]" style={{ left: `${cropDraft.x}%`, top: `${cropDraft.y}%`, width: `${cropDraft.w}%`, height: `${cropDraft.h}%` }}>
          <div onPointerDown={cropDrag("move")} className="absolute inset-0 cursor-move" />
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">{Array.from({ length: 9 }, (_, k) => <span key={k} className="border border-foreground/20" />)}</div>
          {(["tl", "t", "tr", "r", "br", "b", "bl", "l"] as const).map((h) => <div key={h} aria-label={`Край обрезки ${h}`} onPointerDown={cropDrag(h)} className="absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-primary bg-background" style={{ left: h.includes("l") ? "0%" : h.includes("r") ? "100%" : "50%", top: h.includes("t") ? "0%" : h.includes("b") ? "100%" : "50%", cursor: h === "t" || h === "b" ? "ns-resize" : h === "l" || h === "r" ? "ew-resize" : h === "tl" || h === "br" ? "nwse-resize" : "nesw-resize" }} />)}
        </div>
        {snap.v && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-warning" />}
        {snap.h && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-warning" />}
      </div>}
    </div>
      <span className="absolute left-2 top-2 rounded bg-background px-1.5 py-0.5 font-mono text-[10px]">{fmt(t)}</span>
      <button aria-label={pinMon ? "Открепить монитор" : "Закрепить монитор"} aria-pressed={pinMon} onClick={(e) => { e.stopPropagation(); setPinMon(!pinMon); }} className={`absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-full ${pinMon ? "bg-primary text-primary-foreground" : "bg-background text-foreground"}`}>{pinMon ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}</button>
      {!cropDraft && <button aria-label="Формат кадра" aria-expanded={aspOpen} onClick={(e) => { e.stopPropagation(); setAspOpen(!aspOpen); }} className="absolute bottom-2 right-2 z-30 flex h-7 items-center gap-1 rounded-full bg-background px-2.5 font-mono text-[10px] font-semibold"><RectangleHorizontal className="size-3.5" />{aspect}<ChevronDown className="size-3" /></button>}
      <AnimatePresence>{aspOpen && <motion.div role="menu" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: .15 }} onClick={(e) => e.stopPropagation()} className="glass-panel absolute bottom-11 right-2 z-40 grid w-44 gap-0.5 rounded-xl p-1">
        {ASPECTS.map(([id, label]) => <button key={id} role="menuitemradio" aria-checked={aspect === id} onClick={() => { setStore({ aspect: id }); setAspOpen(false); }} className={`flex items-center justify-between rounded-md px-2 py-1.5 text-start text-[11px] ${aspect === id ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}><span className="font-mono font-semibold">{id}</span><span className="opacity-80">{label}</span></button>)}
      </motion.div>}</AnimatePresence>
    </div>
    </div>

    <div className="flex items-center justify-between gap-1">
      {cropDraft ? <Button size="icon" title="Применить обрезку" aria-label="Применить обрезку" onClick={applyCrop}><Check /></Button>
        : <Button size="icon" variant={selItem?.crop ? "default" : "secondary"} title="Обрезка" aria-label="Обрезка" disabled={selItem?.kind !== "video"} onClick={startCrop}><Crop /></Button>}
      {cropDraft ? <Button size="icon" variant="secondary" title="Отменить обрезку" aria-label="Отменить обрезку" onClick={cancelCrop}><X /></Button>
        : <Button size="icon" variant="secondary" title="В начало" aria-label="В начало" onClick={() => { setPlaying(false); setT(first); }}><Rewind /></Button>}
      <Button size="icon" variant="secondary" aria-label="Кадр назад" onClick={() => setT((v) => Math.max(first, v - FRAME))}><SkipBack /></Button>
      <Button size="icon" aria-label={playing ? "Пауза" : "Играть"} onClick={() => { if (!playing && (t >= total || t < first)) setT(first); setPlaying(!playing); }}>{playing ? <Pause /> : <Play />}</Button>
      <Button size="icon" variant="secondary" aria-label="Кадр вперёд" onClick={() => setT((v) => Math.min(total, v + FRAME))}><SkipForward /></Button>
    </div>
    <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden">
      <Button size="icon" variant="secondary" className="size-8 shrink-0" aria-label="Уменьшить масштаб" onClick={() => setZoom((z) => Math.max(minZoom, z / 1.5))}><Minus /></Button>
      <Slider aria-label="Масштаб таймлайна" className="zoom-slider min-w-0 flex-1" value={[zoomPos]} min={0} max={100} step={1} onValueChange={([v = zoomPos]) => setZoom(minZoom * Math.pow(600 / minZoom, v / 100))} />
      <Button size="icon" variant="secondary" className="size-8 shrink-0" aria-label="Увеличить масштаб" onClick={() => setZoom((z) => Math.min(600, z * 1.5))}><Plus /></Button>
    </div>


    <div className={pinTl ? "sticky z-10 -mx-4 bg-background px-4 pb-1" : "relative"} style={pinTl ? { top: headerH + (pinMon ? monH : 0) } : undefined}>
    <div className="flex w-full min-w-0 overflow-hidden rounded-md border border-border bg-timeline">
      <div className="relative z-20 shrink-0 border-r border-border bg-timeline" style={{ width: HEAD }}>
        <button aria-label={pinTl ? "Открепить таймлайн" : "Закрепить таймлайн"} aria-pressed={pinTl} onClick={() => setPinTl(!pinTl)} className={`flex h-5 w-full items-center justify-center bg-timeline ${pinTl ? "text-primary" : "text-muted-foreground"}`}>{pinTl ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}</button>
        {lanes.map((lane) => <div key={lane.key} className="border-b border-border/40" style={{ height: ROW }}>
    <div className="flex h-full min-w-0 items-center gap-1 bg-timeline px-1">
      <span className="w-8 truncate text-[9px] font-semibold">{lane.label}</span>
      {lane.kind === "video" && <button title={hidden[lane.key] ? "Показать видео" : "Скрыть видео"} aria-label={`${hidden[lane.key] ? "Показать" : "Скрыть"} видео ${lane.label}`} aria-pressed={!!hidden[lane.key]} onPointerDown={(e) => e.stopPropagation()} onClick={() => setHidden((m) => ({ ...m, [lane.key]: !m[lane.key] }))} className={hidden[lane.key] ? "text-record" : "text-muted-foreground"}>{hidden[lane.key] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}</button>}
      <button title={muted[lane.key] ? "Включить звук" : "Выключить звук"} aria-label={`${muted[lane.key] ? "Включить" : "Выключить"} звук ${lane.label}`} aria-pressed={!!muted[lane.key]} onPointerDown={(e) => e.stopPropagation()} onClick={() => setMuted((m) => ({ ...m, [lane.key]: !m[lane.key] }))} className={muted[lane.key] ? "text-record" : "text-muted-foreground"}>{muted[lane.key] ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}</button>
    </div>
        </div>)}
      </div>
      <div ref={tlRef} className={`min-w-0 flex-1 overscroll-x-contain overflow-y-hidden ${zoom <= minZoom + 0.01 ? "overflow-x-hidden" : "overflow-x-auto"}`} onPointerDown={() => { setSelected(null); setSelTr(null); }}>
      <div className="relative" style={{ width: Math.max(tlW, total * zoom + 8) }}>
        <div ref={rulerRef} className="relative h-5 cursor-pointer border-b border-border [touch-action:none]" onPointerDown={scrub}>
          {Array.from({ length: Math.ceil(total) + 1 }, (_, s) => (zoom >= 20 || s % 5 === 0) && <span key={s} className="absolute top-0 h-2.5 border-l border-foreground/80 pl-0.5 text-[9px] font-semibold leading-none text-foreground tabular-nums" style={{ left: s * zoom }}>{s}s</span>)}
        </div>
        {laneEls}
        <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-record" style={{ left: Math.max(0, t * zoom) }} />
        <div role="slider" aria-label="Курсор воспроизведения" aria-valuemin={0} aria-valuemax={Math.round(total * 100) / 100} aria-valuenow={Math.round(t * 100) / 100} onPointerDown={scrub} className="absolute top-0 z-30 -translate-x-1/2 cursor-ew-resize px-2 pb-2 [touch-action:none]" style={{ left: Math.max(0, t * zoom) }}><div className="playhead-handle" /></div>
      </div>
    </div>
    </div>
    </div>

    <div className="grid grid-cols-5 place-items-center gap-1 px-1 pb-0.5" role="toolbar" aria-label="Инструменты таймлайна">
      <Button size="icon" variant={addOpen ? "default" : "outline"} title="Добавить" aria-label="Добавить" aria-expanded={addOpen} onClick={() => setAddOpen(!addOpen)}><Plus /></Button>
      <Button size="icon" variant="outline" title="Разрезать" aria-label="Разрезать" onClick={split}><Scissors /></Button>
      <Button size="icon" variant="outline" title="Удалить" aria-label="Удалить" disabled={!selItem && !selTr} onClick={deleteSelection}><Trash2 /></Button>
      <Button size="icon" variant="outline" title="Текст" aria-label="Текст" onClick={() => { const o: Overlay = { id: uid(), text: "Ваш текст", x: 50, y: 40, size: 22, color: "#ffffff", bg: false, font: FONTS[0]!, start: t, end: t + 4, subtitle: false }; setOverlays((cur) => [...cur, o]); setEditing(o.id); }}><Type /></Button>
      <Button size="icon" variant="outline" title="Отделить звук" aria-label="Отделить звук" disabled={selItem?.kind !== "video"} onClick={detach}><Unlink /></Button>
    </div>

    <input ref={fileRef} type="file" accept="video/*,audio/*" className="sr-only" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ""; }} />
    <AnimatePresence>{addOpen && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="glass-panel grid gap-1 rounded-xl p-1.5" role="menu">
      <button role="menuitem" className="flex items-center gap-2 rounded-md px-2 py-2 text-start hover:bg-secondary" onClick={() => fileRef.current?.click()}><FilePlus2 className="size-4" />Добавить</button>
      <button role="menuitem" className="flex items-center gap-2 rounded-md px-2 py-2 text-start hover:bg-secondary" onClick={() => { setVTracks((n) => n + 1); setAddOpen(false); }}><ListVideo className="size-4" />Добавить видео дорожку</button>
      <button role="menuitem" className="flex items-center gap-2 rounded-md px-2 py-2 text-start hover:bg-secondary" onClick={() => { setATracks((n) => n + 1); setAddOpen(false); }}><ListMusic className="size-4" />Добавить аудио дорожку</button>
    </motion.div>}</AnimatePresence>
    {importErr && <p role="alert" className="text-[10px] text-warning">{importErr}</p>}
    <AnimatePresence>{selItem && <motion.div initial={{ opacity: 0, y: 12, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12 }} transition={{ type: "spring", stiffness: 420, damping: 34 }} className="glass-panel space-y-3 rounded-xl p-3">
      <div className="flex items-center justify-between"><b className="flex items-center gap-1"><HelpDot id="inspector" />Инспектор · {selItem.kind === "video" ? "Video" : "Audio"}</b><button aria-label="Снять выделение" onClick={() => setSelected(null)}><X className="size-4" /></button></div>
      <div className="flex flex-wrap gap-1.5">{[0.25, 0.5, 1, 1.5, 2, 4].map((sp) => <Button key={sp} size="sm" variant={fx.speed === sp ? "default" : "outline"} onClick={() => applyFx({ speed: sp })}>{sp}×</Button>)}
        <Button size="sm" variant={fx.reverse ? "default" : "outline"} onClick={() => applyFx({ reverse: !fx.reverse })}>⟲ Реверс</Button></div>
      <select value={fx.look} onChange={(e) => applyFx({ look: e.target.value })} className="w-full rounded-md border border-border bg-secondary px-2 py-1.5">{Object.keys(LOOKS).map((l) => <option key={l}>{l}</option>)}</select>
      <Fs label="Масштаб" v={fx.scale} min={50} max={200} on={(scale) => applyFx({ scale })} dis={false} />
      <Fs label="Позиция X" v={fx.posX} min={-50} max={50} on={(posX) => applyFx({ posX })} dis={false} />
      <Fs label="Прозрачность" v={fx.opacity} min={0} max={100} on={(opacity) => applyFx({ opacity })} dis={false} />
    </motion.div>}</AnimatePresence>

    <AnimatePresence>{mediaOpen && <motion.div role="menu" aria-label="Медиатека" initial={{ opacity: 0, y: -8, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: "spring", stiffness: 420, damping: 32 }} className="glass-panel fixed inset-x-3 top-14 z-50 max-h-[50vh] overflow-y-auto overscroll-contain rounded-2xl p-2">
      <div className="mb-1.5 flex items-center justify-between px-1"><b className="text-xs">Медиатека</b><button aria-label="Закрыть медиатеку" onClick={() => setMediaOpen(false)} className="rounded-full p-1 text-muted-foreground"><X className="size-4" /></button></div>
      {media.length === 0 ? <p className="px-1 py-3 text-[11px] text-muted-foreground">Пока нет клипов. Снимите видео или импортируйте файл через «+».</p> : <div className="grid gap-1">{media.map((m, k) => <button role="menuitem" key={m.id} onClick={() => { addMedia(m); setMediaOpen(false); }} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-start text-[11px] transition-colors active:bg-primary active:text-primary-foreground"><span className="truncate">{m.name || `${m.kind === "audio" ? "A" : "CAM "}${m.camera} · #${k + 1}`}</span><span className="shrink-0 font-mono text-muted-foreground">{m.duration.toFixed(1)}s</span></button>)}</div>}
    </motion.div>}</AnimatePresence>

    <AnimatePresence>{editOverlay && <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }} className="glass-panel absolute inset-x-3 bottom-24 z-50 space-y-2 rounded-xl p-3">
      <div className="flex items-center justify-between"><b>{editOverlay.subtitle ? "Стиль субтитров" : "Текст"}</b><button aria-label="Закрыть" onClick={() => setEditing(null)}><X className="size-4" /></button></div>
      <input value={editOverlay.text} onChange={(e) => setOverlays((o) => o.map((x) => x.id === editOverlay.id ? { ...x, text: e.target.value } : x))} className="w-full rounded-md border border-border bg-secondary px-2 py-1.5" />
      <div className="grid max-h-36 grid-cols-3 gap-1 overflow-y-auto overscroll-contain pr-0.5" role="listbox" aria-label="Шрифт">{FONTS.map((f, k) => <button key={f} role="option" aria-selected={editOverlay.font === f} onClick={() => patchOverlay({ font: f })} className={`truncate rounded border px-1 py-1.5 text-[11px] ${editOverlay.font === f ? "border-primary bg-primary/15" : "border-border"}`} style={{ fontFamily: f }}>{FONT_NAMES[k]}</button>)}</div>
      <div className="flex items-center gap-2"><input type="color" value={editOverlay.color} onChange={(e) => patchOverlay({ color: e.target.value })} /><label className="flex items-center gap-1"><input type="checkbox" checked={editOverlay.bg} onChange={(e) => patchOverlay({ bg: e.target.checked })} />Подложка</label>
        <div className="flex-1"><Slider value={[editOverlay.size]} min={10} max={48} onValueChange={([size = 18]) => patchOverlay({ size })} /></div></div>
      <Button size="sm" variant="outline" className="w-full" onClick={() => { setOverlays((o) => o.filter((x) => x.id !== editOverlay.id)); setEditing(null); }}><Trash2 />Удалить</Button>
    </motion.div>}</AnimatePresence>
    <div className="-mx-1 rounded-lg bg-card p-1.5">
      <div className="grid grid-cols-3 gap-1" role="tablist">{([["transitions", "Переходы"], ["color", "Цвет"], ["audio", "Звук"]] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={panel === id} onClick={() => setPanel((p) => p === id ? null : id)} className={`editor-tab ${panel === id ? "active" : ""}`}>{label}</button>)}</div>
      <AnimatePresence initial={false}>{panel && <motion.div role="tabpanel" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: .22, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden"><motion.div key={panel} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .15 }} className="min-h-56 px-1.5 pb-2 pt-3">
        {(panel !== "color" || selItem?.kind === "video") && <div className="mb-1 flex justify-end"><HelpDot id={panel} /></div>}
        {panel === "transitions" && <><div className="flex min-h-40 gap-2">
          <div className="flex w-24 shrink-0 flex-col gap-1">{TRANSITION_CATS.map((c) => <button key={c.id} onClick={() => setTrCat(c.id)} className={`rounded-md px-2 py-2 text-start text-[11px] ${trCat === c.id ? "bg-primary text-primary-foreground" : "bg-secondary"}`}>{c.label}</button>)}</div>
          <div className="grid flex-1 grid-cols-2 content-start gap-1.5">{TRANSITION_CATS.find((c) => c.id === trCat)!.items.map(([id, label]) => <div key={id} onPointerDown={startTrDrag(id)} className="flex cursor-grab select-none flex-col items-center gap-1 rounded-md border border-border bg-secondary px-1 py-2 text-center text-[10px] [touch-action:none]"><Blend className="size-4" />{label}</div>)}</div>
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">Перетащите переход на стык двух видеоклипов на таймлайне.</p>
        {dropErr && <p role="alert" className="mt-1 text-[10px] text-warning">{dropErr}</p>}
</>}
        {panel === "color" && <>{selItem?.kind === "video" ? <div className="space-y-3">
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">{COLOR_KEYS.map(([k, label, help]) => { const v = colorOf(selItem)[k]; return <div key={k}><div className="mb-1.5 flex items-center justify-between gap-1"><span className="flex items-center gap-1 truncate">{label}<HelpDot id={help} /></span><span className="font-mono text-muted-foreground">{v}</span></div><Slider value={[v]} min={-100} max={100} onValueChange={([x = 0]) => setColor(k, x)} /></div>; })}</div>
          <Button size="sm" variant="outline" className="w-full" onClick={() => setItems((cur) => cur.map((i) => i.id === selItem!.id ? { ...i, color: { ...ZERO_COLOR } } : i))}>Сбросить цвет клипа</Button>
        </div> : <div className="flex items-center justify-between gap-2"><p className="text-[11px] text-muted-foreground">Нажмите на видеоклип на таймлайне, чтобы настроить его цвет.</p><HelpDot id="color" /></div>}
        {chroma && <div className="mt-2 border-t border-border/50 pt-2">{chroma}</div>}
</>}
        {panel === "audio" && audio}
      </motion.div></motion.div>}</AnimatePresence>
    </div>
    {ghost && typeof document !== "undefined" && createPortal(<div className="pointer-events-none fixed z-[300] -translate-x-1/2 -translate-y-1/2 rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-lg" style={{ left: ghost.x, top: ghost.y }}>{TR_NAME[ghost.type]}</div>, document.body)}
  </section>;
}

/** Scales and recentres the frame so the confirmed crop fills the canvas edge-to-edge. */
function cropTransform(c?: CropBox) {
  if (!c) return "";
  const k = Math.max(100 / c.w, 100 / c.h); const cx = c.x + c.w / 2 - 50; const cy = c.y + c.h / 2 - 50;
  return `scale(${k}) translate(${-cx}%, ${-cy}%)`;
}
function Fs({ label, v, min, max, on, dis }: { label: string; v: number; min: number; max: number; on: (v: number) => void; dis: boolean }) {
  return <div><div className="mb-1.5 flex justify-between"><span>{label}</span><span className="text-muted-foreground">{v}</span></div><Slider disabled={dis} value={[v]} min={min} max={max} onValueChange={([x = v]) => on(x)} /></div>;
}
