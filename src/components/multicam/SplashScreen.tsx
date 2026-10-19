import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { probeDeviceSafe, type CapabilityMatrix } from "@/lib/capabilities";

const STAGES = ["Запрос разрешений...", "Проверяю основную камеру...", "Проверяю фронтальную камеру...", "Проверяю все функции, кодеки и системные возможности..."];

export function SplashScreen({ onDone }: { onDone: (m: CapabilityMatrix) => void }) {
  const [stage, setStage] = useState(0); const [progress, setProgress] = useState(0);
  useEffect(() => {
    let alive = true;
    void probeDeviceSafe((st, p) => { if (alive) { setStage(st); setProgress(p); } }).then((m) => { if (alive) onDone(m); });
    return () => { alive = false; };
  }, [onDone]);
  return <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background px-8 text-center">
    <p className="text-sm font-semibold uppercase tracking-[0.25em]">MULTI-CAM POV</p>
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary"><motion.div className="h-full bg-primary" animate={{ width: `${progress}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} /></div>
    <p aria-live="polite" className="min-h-10 text-xs text-muted-foreground">{STAGES[stage]}</p>
  </div>;
}
