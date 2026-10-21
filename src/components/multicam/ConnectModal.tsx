import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import QRCode from "qrcode";
import jsQR from "jsqr";
import { ChevronLeft, Hash, LogOut, QrCode, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { mesh } from "@/lib/mesh";
import { useMulticamStore } from "@/lib/multicam-store";
import { useT } from "@/lib/i18n";
import { useMeshPeers } from "./useMesh";
import { bounded, retry } from "@/lib/async";

type Step = "choose" | "id" | "qr";

export function ConnectModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const s = useMulticamStore();
  const peers = useMeshPeers();
  const [step, setStep] = useState<Step>("choose");
  const leave = () => { mesh.leave(); s.set({ role: "solo", sessionCode: "POV-842" }); };

  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] grid place-items-center bg-overlay p-4" onClick={onClose}>
    <motion.div initial={{ scale: .94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: .96, opacity: 0 }} transition={{ type: "spring", damping: 26, stiffness: 320 }}
      onClick={(e) => e.stopPropagation()} className="glass-panel max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        {step !== "choose" ? <Button size="icon" variant="ghost" aria-label={t("back")} onClick={() => setStep("choose")}><ChevronLeft /></Button> : <span className="size-9" />}
        <h2 className="min-w-0 flex-1 text-center text-lg font-semibold">{step === "choose" ? t("howConnect") : step === "id" ? t("byId") : t("byQr")}</h2>
        <Button size="icon" variant="ghost" aria-label={t("close")} onClick={onClose}><X /></Button>
      </div>
      {step === "choose" && <div className="space-y-3">
        <Choice icon={<Hash />} title={t("byId")} sub={t("byIdHint")} onClick={() => setStep("id")} />
        <Choice icon={<QrCode />} title={t("byQr")} sub={t("byQrHint")} onClick={() => setStep("qr")} />
        {s.role !== "solo" && <div className="rounded-xl bg-card p-3 text-sm">
          <p className="mb-2 text-xs text-muted-foreground">{t("peers")} · {peers.length}</p>
          {peers.length === 0 ? <p className="text-muted-foreground">{t("noPeers")}</p> : peers.map((p) => <p key={p.id} className="flex justify-between"><span>{p.name}</span><span className="text-muted-foreground">{p.latency ?? "–"} ms</span></p>)}
          <Button className="mt-3 w-full" variant="outline" onClick={leave}><LogOut />{t("leave")}</Button>
        </div>}
      </div>}
      {step === "id" && <IdFlow />}
      {step === "qr" && <QrFlow />}
    </motion.div>
  </motion.div>;
}

function Choice({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void }) {
  return <motion.button whileTap={{ scale: .97 }} onClick={onClick} className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-start transition-colors hover:bg-secondary">
    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">{icon}</span>
    <span className="min-w-0"><span className="block font-semibold">{title}</span><span className="block text-xs text-muted-foreground">{sub}</span></span>
  </motion.button>;
}

function RoleSwitch({ host, onChange }: { host: boolean; onChange: (host: boolean) => void }) {
  const { t } = useT();
  return <div className="segmented mb-4 w-full"><button className={host ? "active" : ""} onClick={() => onChange(true)}>{t("iAmHost")}</button><button className={!host ? "active" : ""} onClick={() => onChange(false)}>{t("iAmCamera")}</button></div>;
}

function IdFlow() {
  const { t } = useT(); const s = useMulticamStore(); const peers = useMeshPeers();
  const [host, setHost] = useState(true); const [value, setValue] = useState("");
  const create = () => { const id = String(Math.floor(100000 + Math.random() * 900000)); mesh.joinLocal(id); s.set({ role: "host", sessionCode: id }); };
  const join = () => { if (!/^\d{3,12}$/.test(value)) return; mesh.joinLocal(value); s.set({ role: "slave", sessionCode: value }); };
  return <div>
    <RoleSwitch host={host} onChange={setHost} />
    {host ? <div className="text-center">
      {s.role === "host" && mesh.localId ? <><p className="text-xs text-muted-foreground">{t("sessionId")}</p><p className="my-2 font-mono text-4xl font-semibold tracking-[.2em]">{mesh.localId}</p><p className="text-sm text-muted-foreground">{peers.length ? `${t("connected")}: ${peers.length}` : t("waiting")}</p></>
        : <Button className="w-full" size="lg" onClick={create}>{t("createSession")}</Button>}
    </div> : <div className="space-y-3">
      <input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} placeholder={t("enterId")} className="h-12 w-full rounded-xl border border-border bg-card px-4 text-center font-mono text-xl tracking-[.2em] outline-none focus:border-primary" />
      <Button className="w-full" size="lg" disabled={value.length < 3} onClick={join}>{t("join")}</Button>
      {s.role === "slave" && mesh.localId && <p className="text-center text-sm text-status">{peers.length ? `${t("connected")} · ${mesh.localId}` : t("waiting")}</p>}
    </div>}
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">{t("idNote")}</p>
  </div>;
}

function QrFlow() {
  const { t } = useT(); const s = useMulticamStore(); const peers = useMeshPeers();
  const [host, setHost] = useState(s.role !== "slave");
  const [qr, setQr] = useState<string | null>(null); const [code, setCode] = useState("");
  const [addresses, setAddresses] = useState<string[]>([]);
  const [phase, setPhase] = useState<"idle" | "busy" | "show" | "scan" | "done">("idle");
  const [error, setError] = useState(""); const [paste, setPaste] = useState("");

  const operation = useRef(0); const alive = useRef(true); const busy = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; operation.current++; }; }, []);
  const current = (id: number) => alive.current && id === operation.current;
  const show = async (c: string, a: string[], id: number) => {
    const image = await retry(() => bounded(QRCode.toDataURL(c, { errorCorrectionLevel: "L", margin: 1, width: 480 }), 4000, "QR generation"));
    if (current(id)) { setCode(c); setAddresses(a); setQr(image); setPhase("show"); }
  };
  const makeOffer = async () => {
    if (busy.current) return; busy.current = true; const id = ++operation.current;
    setError(""); setPhase("busy");
    const session = s.role === "host" ? s.sessionCode : `POV-${Math.floor(100 + Math.random() * 900)}`;
    try { const r = await bounded(mesh.createOffer(session), 16000, "Connection offer"); if (!current(id)) return; s.set({ role: "host", sessionCode: session }); await show(r.code, r.addresses, id); }
    catch { if (current(id)) { setError(t("scanError")); setPhase("idle"); } }
    finally { busy.current = false; }
  };
  const handleCode = async (text: string) => {
    if (busy.current) return; busy.current = true; const id = ++operation.current; setError(""); setPhase("busy");
    try {
      if (host) { await bounded(mesh.acceptAnswer(text), 12000, "Connection answer"); if (current(id)) setPhase("done"); }
      else { const r = await bounded(mesh.answerOffer(text), 16000, "Connection answer"); if (!current(id)) return; s.set({ role: "slave", sessionCode: r.session }); await show(r.code, r.addresses, id); }
    } catch { if (current(id)) { setError(t("scanError")); setPhase(host && qr ? "show" : "idle"); } }
    finally { busy.current = false; }
  };
  useEffect(() => { if (!host && phase === "show" && peers.length) setPhase("done"); }, [host, phase, peers.length]);

  return <div>
    <RoleSwitch host={host} onChange={(h) => { operation.current++; busy.current = false; setHost(h); setPhase("idle"); setQr(null); }} />
    {phase === "busy" && <p className="py-10 text-center text-sm text-muted-foreground">{t("generating")}</p>}
    {phase === "idle" && (host ? <Button className="w-full" size="lg" onClick={() => void makeOffer()}><QrCode />{t("createSession")}</Button>
      : <Scanner label={t("scanHostQr")} onCode={(c) => void handleCode(c)} />)}
    {phase === "show" && qr && <div className="text-center">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{host ? t("step1") : t("showToHost")}</p>
      <img src={qr} alt="QR" className="mx-auto aspect-square w-full max-w-64 rounded-xl bg-foreground p-2" />
      {addresses.length > 0 && <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">{t("address")}: {addresses.slice(0, 3).join(" · ")}</p>}
      <button className="mt-1 text-[10px] text-primary underline" onClick={() => void navigator.clipboard?.writeText(code)}>{code.length} B · copy</button>
      {host && <Button className="mt-4 w-full" onClick={() => setPhase("scan")}><ScanLine />{t("scanReply")}</Button>}
      {!host && <p className="mt-3 text-sm text-muted-foreground">{t("waiting")}</p>}
    </div>}
    {phase === "scan" && <Scanner label={t("step2")} onCode={(c) => void handleCode(c)} />}
    {phase === "done" && <div className="py-6 text-center"><p className="text-lg font-semibold text-status">{t("connected")} · {peers.length} {t("devices")}</p>{host && <Button className="mt-4 w-full" onClick={() => void makeOffer()}>{t("addCamera")}</Button>}</div>}
    {(phase === "idle" || phase === "scan") && <div className="mt-3 flex gap-2"><input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={t("pasteCode")} className="h-9 min-w-0 flex-1 rounded-md border border-border bg-card px-3 text-xs outline-none" /><Button size="sm" variant="secondary" disabled={!paste} onClick={() => void handleCode(paste)}>{t("apply")}</Button></div>}
    {error && <p className="mt-3 text-center text-sm text-record">{error}</p>}
  </div>;
}

function Scanner({ label, onCode }: { label: string; onCode: (code: string) => void }) {
  const { t } = useT();
  const video = useRef<HTMLVideoElement>(null); const canvas = useRef<HTMLCanvasElement>(null);
  const [blocked, setBlocked] = useState(false);
  const callback = useRef(onCode); callback.current = onCode;
  useEffect(() => {
    let stream: MediaStream | null = null; let raf = 0; let alive = true;
    bounded(navigator.mediaDevices?.getUserMedia({ video: { facingMode: "environment" } }) ?? Promise.reject(new Error("Camera unavailable")), 6000, "QR camera", (late) => late.getTracks().forEach((track) => track.stop())).then((st) => {
      if (!alive) { st.getTracks().forEach((x) => x.stop()); return; }
      stream = st; if (video.current) { video.current.srcObject = st; void video.current.play().catch(() => { if (alive) setBlocked(true); }); }
      const tick = () => {
        const v = video.current; const c = canvas.current;
        if (v && c && v.videoWidth) {
          c.width = v.videoWidth; c.height = v.videoHeight; const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) { ctx.drawImage(v, 0, 0); const img = ctx.getImageData(0, 0, c.width, c.height); const hit = jsQR(img.data, img.width, img.height); if (hit?.data) { alive = false; stream?.getTracks().forEach((track) => track.stop()); callback.current(hit.data); return; } }
        }
        if (alive) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }).catch(() => { if (alive) setBlocked(true); });
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach((x) => x.stop()); if (video.current) video.current.srcObject = null; };
  }, []);
  return <div><p className="mb-2 text-center text-xs text-muted-foreground">{label}</p>
    {blocked ? <p className="rounded-xl bg-card p-4 text-center text-sm text-warning">{t("cameraBlocked")}</p>
      : <div className="relative mx-auto aspect-square w-full max-w-72 overflow-hidden rounded-xl bg-viewfinder"><video ref={video} muted playsInline className="h-full w-full object-cover" /><div className="absolute inset-8 rounded-lg border-2 border-tracking" /></div>}
    <canvas ref={canvas} className="hidden" /></div>;
}
