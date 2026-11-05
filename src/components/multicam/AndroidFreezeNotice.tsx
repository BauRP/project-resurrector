import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { bounded } from "@/lib/async";
import { uiFreeze } from "@/lib/ui-freeze-bridge";
import { traceUiAction } from "@/lib/freeze-action-trace";

/** Never blocks startup; shows evidence of a real previous Android UI hang. */
export function AndroidFreezeNotice() {
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [copying, setCopying] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("UiFreeze")) return;
    let live = true;
    let pulsePending = false;
    const heartbeat = () => {
      if (!live || document.hidden || pulsePending) return;
      pulsePending = true;
      // A hung JS loop simply stops invoking this callback. The Android
      // daemon then records which side (UI/renderer) became unresponsive.
      void bounded(uiFreeze.pulse(), 1600, "WebView heartbeat")
        .catch(() => undefined)
        .finally(() => { pulsePending = false; });
    };
    heartbeat();
    const heartbeatId = window.setInterval(heartbeat, 2000);
    document.addEventListener("visibilitychange", heartbeat);
    const id = window.setTimeout(() => {
      void bounded(uiFreeze.read(), 1500, "Android UI freeze report")
        .then(result => { if (live && result.report) setReport(result.report.slice(0, 4096)); })
        .catch(() => undefined);
    }, 1800);
    return () => {
      live = false;
      window.clearTimeout(id);
      window.clearInterval(heartbeatId);
      document.removeEventListener("visibilitychange", heartbeat);
    };
  }, []);
  if (!report) return null;
  const copyReport = () => {
    if (copying || !report) return;
    setCopyError("");
    setCopying(true);
    traceUiAction("freeze report: copy requested");
    // Never allocate/select a textarea or use synchronous execCommand(copy).
    // On native Android ClipboardManager writes outside the WebView renderer.
    const copy = Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("UiFreeze")
      ? uiFreeze.copyReport({ report })
      : navigator.clipboard?.writeText
        ? navigator.clipboard.writeText(report)
        : Promise.reject(new Error("Clipboard API unavailable"));
    void bounded(copy, 2000, "Copy freeze report")
      .then(() => setCopied(true))
      .catch(() => setCopyError("Не удалось скопировать отчёт. Скопируй текст из выделяемого поля ниже."))
      .finally(() => setCopying(false));
  };
  const dismiss = () => {
    setReport("");
    void bounded(uiFreeze.clear(), 1200, "Clear freeze report").catch(() => undefined);
  };
  return <aside className="android-freeze-notice absolute inset-x-3 top-[calc(env(safe-area-inset-top)+4.6rem)] z-[90] rounded-2xl border border-warning/70 bg-card p-3 text-xs text-foreground shadow-xl" role="alert">
    <p className="font-semibold">Обнаружено зависание Android-интерфейса в прошлом запуске.</p>
    <p className="mt-1">Приложение сохранило технический отчёт. Скопируй его и отправь сюда, чтобы установить точную причину зависания.</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={copyReport} disabled={copying} className="rounded-full bg-primary px-3 py-2 text-primary-foreground">{copied ? "Скопировано" : copying ? "Копирую…" : "Скопировать отчёт"}</button>
      <button type="button" onClick={dismiss} className="rounded-full border border-border px-3 py-2">Закрыть</button>
    </div>
    {copyError && <p role="alert" className="mt-2 text-warning">{copyError}</p>}
    {copyError && <textarea aria-label="Текст отчёта для копирования" className="mt-2 w-full rounded-md border border-border bg-background p-2 text-xs" rows={3} readOnly value={report} onFocus={event => event.currentTarget.select()} />}
  </aside>;
}
