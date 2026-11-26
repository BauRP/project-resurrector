import { useEffect, useRef, useState } from "react";
import { isNative } from "@/lib/native";
import { cameraAudit, cameraAuditPauseReason, cameraAuditPhase, cameraAuditPlanComplete, cameraAuditProgress, type CameraAuditCheckpoint } from "@/lib/first-run-camera-audit";
import { nativeCapture } from "@/lib/native-capture";
import { readDiagnosticEditorObservations,readDiagnosticExportObservations } from "@/lib/diagnostic-media-observations";
import { auditMediaCoverage, AUDIT_EVIDENCE_CHANGED, type AuditMediaCoverage } from "@/lib/initial-audit-coverage";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";

/** Camera-only display of a separate-process read-only Camera2 metadata scan. */
export function CameraAuditBanner({onOpenDiagnostics}:{onOpenDiagnostics?:()=>void}={}) {
  const [audit, setAudit] = useState<CameraAuditCheckpoint | null>(null);
  const [problem, setProblem] = useState("");
  const startedHere = useRef(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [paused, setPaused] = useState(false);
  const [coverage,setCoverage]=useState<AuditMediaCoverage|null>(null);
  useEffect(() => {
    if (!isNative()) return;
    let alive = true;
    startedHere.current = false;
    setPaused(false);
    setProblem("");
    let timer = 0;
    let lastCheckpoint = "";
    let lastChangedAt = Date.now();
    const MAX_STALE_MS = 30000;
    const read = async () => {
      try {
        const response = await cameraAudit.getStatus();
        if (!alive) return;
        const checkpoint = [
          response.audit.state, response.audit.codecState,
          response.audit.codecIntegrityVersion,
          response.audit.metadataRowsValid,
          response.audit.codecRowsValid, response.audit.planRowsValid,
          response.audit.completed, response.audit.total,
          response.audit.codecCompleted, response.audit.codecTotal,
          response.audit.planState, response.audit.planVersion,
          response.audit.planCompleted,
          response.audit.planTotal, response.audit.planCandidateCount,
          response.audit.error, response.audit.codecError, response.audit.planError,
        ].join("|");
        if (checkpoint !== lastCheckpoint) {
          lastCheckpoint = checkpoint;
          lastChangedAt = Date.now();
          setAudit(response.audit);
          // A real new checkpoint supersedes a previous stalled-bridge alert.
          setProblem("");
        }
        // On reopening Camera we may still see the OLD saved retry before
        // Android's low-priority service changes it to running. Give the new
        // invocation a bounded opportunity to resume. On a genuine thermal
        // pause, stop polling rather than showing a fictitious renderer freeze.
        if (response.audit.state === "retry" || response.audit.codecState === "retry" ||
            response.audit.planState === "retry") {
          if (startedHere.current && Date.now() - lastChangedAt < 8000)
            timer = window.setTimeout(() => { if (alive) void read(); }, 1800);
          else setPaused(true);
          return;
        }
        // A vendor CameraService can hang without returning another callback.
        // Stop polling an unchanged checkpoint instead of waking WebView
        // indefinitely. The saved service checkpoint remains authoritative.
        if (Date.now() - lastChangedAt >= MAX_STALE_MS) {
          setProblem("Проверка не продвигается. Сохранённые результаты можно продолжить.");
          setPaused(true);
          return;
        }
        const stagesComplete = cameraAuditPlanComplete(response.audit);
        if (stagesComplete && startedHere.current) {
          setShowCompleted(true);
          timer = window.setTimeout(() => { if (alive) setShowCompleted(false); }, 4500);
          return;
        }
        if (!stagesComplete)
          timer = window.setTimeout(() => { if (alive) void read(); }, 1800);
      } catch {
        if (alive) { setProblem("Паспорт временно недоступен."); setPaused(true); }
      }
    };
    // Permission and Binder work only after the camera screen is responsive.
    const cancel = scheduleAfterResponsivePaint(() => {
      void cameraAudit.getStatus().then(async current => {
        if (!alive) return;
        setAudit(current.audit);
        // The first read is only a snapshot, not a test. The worker starts
        // after it; the polling loop begins with its own progress timestamp.
        if (!cameraAuditPlanComplete(current.audit)) {
          const result = await cameraAudit.startIfNeeded();
          if (!alive) return;
          if (result.started) startedHere.current = true;
          if (!result.started && result.reason === "camera-permission-denied") {
            setProblem("Для проверки камер требуется разрешение Android.");
            setPaused(true);
            return;
          }
          if (!result.started && result.reason && result.reason !== "already-complete") {
            setProblem("Проверка временно отложена: " + result.reason);
            setPaused(true);
            return;
          }
        }
        await read();
      }).catch(() => {
        if (alive) { setProblem("Проверка временно недоступна."); setPaused(true); }
      });
    }, { stableFrames: 5, maxFrameGapMs: 350, backgroundFallbackMs: 1800, visibleOnly: true });
    return () => { alive = false; cancel(); if (timer) window.clearTimeout(timer); };
  }, [attempt]);

  // The saved baseline is not a repeated startup progress screen.
  // Full functional diagnosis has its own future completion state.
  const phase = audit ? cameraAuditPhase(audit) : "metadata";
  const complete = audit !== null && cameraAuditPlanComplete(audit);
  useEffect(()=>{
    if(!isNative()||!complete)return;
    let alive=true,inFlight=false,dirty=false;
    const refresh=async()=>{
      if(!alive||document.hidden)return;
      if(inFlight){dirty=true;return;}
      inFlight=true;
      try{
        const [passport,history]=await Promise.all([cameraAudit.getPassport(),nativeCapture.auditHistory()]);
        if(alive&&!document.hidden)setCoverage(cameraAuditPlanComplete(passport.audit)?auditMediaCoverage(passport.audit,history,readDiagnosticEditorObservations(),readDiagnosticExportObservations()):null);
      }catch{if(alive)setCoverage(null);}
      finally{inFlight=false;if(alive&&dirty){dirty=false;void refresh();}}
    };
    const onVisible=()=>{if(!document.hidden)void refresh();};
    const cancel=scheduleAfterResponsivePaint(()=>void refresh(),{stableFrames:3,visibleOnly:true});
    window.addEventListener(AUDIT_EVIDENCE_CHANGED,onVisible);
    document.addEventListener("visibilitychange",onVisible);
    return()=>{alive=false;cancel();window.removeEventListener(AUDIT_EVIDENCE_CHANGED,onVisible);document.removeEventListener("visibilitychange",onVisible);};
  },[complete]);
  if (!isNative()) return null;
  if(complete&&!showCompleted){
    if(coverage&&coverage.total>0&&coverage.exported===coverage.total)return null;
    const percent=coverage&&coverage.total>0?Math.floor(coverage.recorded*100/coverage.total):0;
    return <section className="camera-audit-banner mx-2 my-2 shrink-0 rounded-xl border border-border bg-card/95 p-3" aria-label="Практическая диагностика камер">
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-semibold">
        <span>Практическая диагностика камер</span><span className="tabular-nums">{coverage&&coverage.total>0?coverage.recorded+"/"+coverage.total+" видеорежимов":"План сохранён"}</span>
      </div>
      {coverage&&coverage.total>0&&<div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Покрытие запланированных обычных AVC-режимов">
        <div className="h-full rounded-full bg-primary" style={{width:percent+"%"}}/>
      </div>}
      <p className="mt-1 text-[11px] text-muted-foreground">{coverage&&coverage.total>0?"Сохранённые видеопробы не повторяются. Неподтверждённых режимов: "+coverage.unconfirmed+". Это не вся диагностика.":"Характеристики сохранены. Практические результаты пока недоступны или нет подходящих AVC-кандидатов."}</p>
      {coverage&&coverage.total>0&&<p className="mt-1 break-words text-[11px] text-muted-foreground">Медиатека: {coverage.editor}/{coverage.total} · короткий экспорт: {coverage.exported}/{coverage.total}. По сохранённым совпадающим записям, не полная проверка всех кадров.</p>}
      {onOpenDiagnostics&&<button type="button" className="mt-1 min-h-11 max-w-full whitespace-normal rounded-md border border-border px-3 text-xs" onClick={onOpenDiagnostics}>Открыть практическую диагностику</button>}
    </section>;
  }
  // This is a count of three saved declaration stages, not functional recording.
  const percent = audit ? cameraAuditProgress(audit) : 0;
  const line = problem || (audit && cameraAuditPauseReason(audit)) || (complete
    ? "Проверка заявленных характеристик завершена. Испытания реальной записи ещё не проводились."
    : audit?.state === "retry" || audit?.codecState === "retry" || audit?.planState === "retry"
      ? "Проверка временно приостановлена. Результаты сохранены и продолжатся при следующем запуске."
      : phase === "done"
        ? "Составляем список будущих испытаний. Камера не открывается, запись не запускается."
        : phase === "codecs"
          ? "Сверяем заявленные видеорежимы с возможностями кодировщиков. Вы можете пользоваться приложением."
          : "Определяем объективы и сохраняем паспорт. Камера и другие разделы доступны.");
  return <section aria-label="Диагностика камер" className="camera-audit-banner mx-2 my-2 shrink-0 rounded-xl border border-border bg-card/95 p-3 text-foreground shadow-sm">
    <div className="mb-1 flex items-center justify-between gap-2 text-xs font-semibold">
      <span>{complete ? "Проверка характеристик завершена" : "Диагностика камер"}</span>
      <span className="shrink-0 tabular-nums">{percent}% характеристик</span>
    </div>
    <div className="h-1.5 overflow-hidden rounded-full bg-secondary" role="progressbar"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Обнаружение камер">
      <div className="h-full rounded-full bg-primary transition-[width]" style={{width: percent + "%"}} />
    </div>
    <p role="status" className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">{line}</p>
    {paused && !complete && <button type="button" className="mt-1 min-h-11 max-w-full whitespace-normal rounded-md border border-border px-3 text-xs" onClick={() => { setPaused(false); setAttempt(n=>n+1); }}>Продолжить проверку</button>}
    {audit && audit.total > 0 && <p className="mt-1 text-[10px] text-muted-foreground">
      Доступные ID Camera2: {audit.camera2EnumeratedIdCount ?? audit.total}. Раскрытые физические сенсоры: {audit.physicalIdsDisclosed ?? 0} (не суммируются).
      <span className="block">Характеристики: {audit.completed}/{audit.total}. Кодеки: {audit.codecCompleted ?? 0}/{audit.codecTotal ?? audit.total}. План: {audit.planCompleted ?? 0}/{audit.planTotal ?? audit.total}, кандидатов: {audit.planCandidateCount ?? 0}. Практическая запись не проверена.</span>
    </p>}
  </section>;
}
