import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { bounded } from "@/lib/async";

interface UiFreezeBridge {
  read(): Promise<{report: string; recordedAt: number}>;
  clear(): Promise<void>;
}
const uiFreeze = registerPlugin<UiFreezeBridge>("UiFreeze");

/** Never blocks startup; shows evidence of a real previous Android UI hang. */
export function AndroidFreezeNotice() {
  const [report, setReport] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("UiFreeze")) return;
    let live = true;
    const id = window.setTimeout(() => {
      void bounded(uiFreeze.read(), 1500, "Android UI freeze report")
        .then(result => { if (live && result.report) setReport(result.report.slice(0, 4096)); })
        .catch(() => undefined);
    }, 1800);
    return () => { live = false; window.clearTimeout(id); };
  }, []);
  if (!report) return null;
  const copyReport = () => {
    // Clicking also works in Android WebViews without async Clipboard support.
    const copyFallback = () => {
      const field = document.createElement("textarea");
      field.value = report;
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const ok = document.execCommand("copy");
      field.remove();
      if (ok) setCopied(true);
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(report).then(() => setCopied(true), copyFallback);
    } else copyFallback();
  };
  const dismiss = () => {
    setReport("");
    void bounded(uiFreeze.clear(), 1200, "Clear freeze report").catch(() => undefined);
  };
  return <aside className="android-freeze-notice absolute inset-x-3 top-[calc(env(safe-area-inset-top)+4.6rem)] z-[90] rounded-2xl border border-warning/70 bg-card p-3 text-xs text-foreground shadow-xl" role="alert">
    <p className="font-semibold">Обнаружено зависание Android-интерфейса в прошлом запуске.</p>
    <p className="mt-1">Приложение сохранило технический отчёт. Скопируй его и отправь сюда, чтобы установить точную причину зависания.</p>
    <div className="mt-2 flex flex-wrap gap-2">
      <button type="button" onClick={copyReport} className="rounded-full bg-primary px-3 py-2 text-primary-foreground">{copied ? "Скопировано" : "Скопировать отчёт"}</button>
      <button type="button" onClick={dismiss} className="rounded-full border border-border px-3 py-2">Закрыть</button>
    </div>
  </aside>;
}
