import { useEffect, useState } from "react";
import { isNative } from "@/lib/native";
import { cameraAudit, cameraAuditProgress, type CameraAuditCheckpoint } from "@/lib/first-run-camera-audit";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";

/** Camera-only display of a separate-process read-only Camera2 metadata scan. */
export function CameraAuditBanner() {
  const [audit, setAudit] = useState<CameraAuditCheckpoint | null>(null);
  const [problem, setProblem] = useState("");
  useEffect(() => {
    if (!isNative()) return;
    let alive = true;
    let timer = 0;
    const read = async () => {
      try {
        const response = await cameraAudit.getStatus();
        if (!alive) return;
        setAudit(response.audit);
        if (response.audit.state !== "complete")
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
        if (current.audit.state !== "complete") {
          const result = await cameraAudit.startIfNeeded();
          if (!alive) return;
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

  if (!isNative()) return null;
  const complete = audit?.state === "complete";
  const percent = audit ? cameraAuditProgress(audit) : 0;
  const line = problem || (complete
    ? "Базовое обнаружение завершено. Подробная проверка режимов и кнопок ещё ожидает выполнения."
    : audit?.state === "retry"
      ? "Проверка приостановилась. Сохранённые результаты останутся до следующего запуска."
      : "Определяем объективы и сохраняем паспорт. Камера и другие разделы доступны.");
  return <section aria-label="Диагностика камер" className="mx-2 my-2 shrink-0 rounded-xl border border-border bg-card/95 p-3 text-foreground shadow-sm">
    <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
      <span>{complete ? "Базовое обнаружение камер" : "Первичная проверка камер"}</span>
      <span className="tabular-nums">{percent}%</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Обнаружение камер">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{width: percent + "%"}} />
    </div>
    <p role="status" className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{line}</p>
    {audit && audit.total > 0 && <p className="mt-1 text-[10px] text-muted-foreground">
      Получены сведения: {audit.completed} из {audit.total} камер. Практические испытания записи не засчитаны.
    </p>}
  </section>;
}
