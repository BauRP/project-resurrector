import { useEffect, useRef, useState } from "react";
import { isNative } from "@/lib/native";
import { cameraAudit, cameraAuditPhase, cameraAuditProgress, type CameraAuditCheckpoint } from "@/lib/first-run-camera-audit";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";

/** Camera-only display of a separate-process read-only Camera2 metadata scan. */
export function CameraAuditBanner() {
  const [audit, setAudit] = useState<CameraAuditCheckpoint | null>(null);
  const [problem, setProblem] = useState("");
  const startedHere = useRef(false);
  const [showCompleted, setShowCompleted] = useState(false);
  useEffect(() => {
    if (!isNative()) return;
    let alive = true;
    let timer = 0;
    const read = async () => {
      try {
        const response = await cameraAudit.getStatus();
        if (!alive) return;
        setAudit(response.audit);
        if (cameraAuditPhase(response.audit) === "done" && startedHere.current) {
          setShowCompleted(true);
          timer = window.setTimeout(() => { if (alive) setShowCompleted(false); }, 4500);
          return;
        }
        if (cameraAuditPhase(response.audit) !== "done")
          timer = window.setTimeout(() => { if (alive) void read(); }, 1800);
      } catch {
        if (alive) setProblem("Паспорт временно недоступен. Проверка возобновится при следующем запуске.");
      }
    };
    // Permission and Binder work only after the camera screen is responsive.
    const cancel = scheduleAfterResponsivePaint(() => {
      void cameraAudit.getStatus().then(async current => {
        if (!alive) return;
        setAudit(current.audit);
        if (cameraAuditPhase(current.audit) !== "done") {
          const result = await cameraAudit.startIfNeeded();
          if (!alive) return;
          if (result.started) startedHere.current = true;
          if (!result.started && result.reason === "camera-permission-denied") {
            setProblem("Для проверки камер требуется разрешение Android.");
            return;
          }
          if (!result.started && result.reason && result.reason !== "already-complete") {
            setProblem("Проверка временно отложена: " + result.reason);
            return;
          }
        }
        await read();
      }).catch(() => {
        if (alive) setProblem("Проверка временно недоступна. Повторим при следующем запуске.");
      });
    }, { stableFrames: 5, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true });
    return () => { alive = false; cancel(); if (timer) window.clearTimeout(timer); };
  }, []);

  // The saved baseline is not a repeated startup progress screen.
  // Full functional diagnosis has its own future completion state.
  const phase = audit ? cameraAuditPhase(audit) : "metadata";
  if (!isNative() || (phase === "done" && !showCompleted)) return null;
  const complete = phase === "done";
  const percent = audit ? cameraAuditProgress(audit) : 0;
  const line = problem || (complete
    ? "Проверка заявленных характеристик завершена. Испытания реальной записи ещё не проводились."
    : audit?.state === "retry" || audit?.codecState === "retry"
      ? "Проверка временно приостановлена. Результаты сохранены и продолжатся при следующем запуске."
      : phase === "codecs"
        ? "Сверяем заявленные видеорежимы с возможностями кодировщиков. Вы можете пользоваться приложением."
        : "Определяем объективы и сохраняем паспорт. Камера и другие разделы доступны.");
  return <section aria-label="Диагностика камер" className="mx-2 my-2 shrink-0 rounded-xl border border-border bg-card/95 p-3 text-foreground shadow-sm">
    <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
      <span>{complete ? "Проверка характеристик завершена" : "Диагностика камер"}</span>
      <span className="tabular-nums">{percent}%</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Обнаружение камер">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{width: percent + "%"}} />
    </div>
    <p role="status" className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{line}</p>
    {audit && audit.total > 0 && <p className="mt-1 text-[10px] text-muted-foreground">
      Объективы: {audit.completed}/{audit.total}. Кодеки: {audit.codecCompleted ?? 0}/{audit.codecTotal ?? audit.total}. Практическая запись не проверена.
    </p>}
  </section>;
}
