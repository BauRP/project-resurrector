import { useEffect, useState, type ReactNode } from "react";
import { scheduleAfterPaintTask } from "@/lib/after-paint-task";
import { traceUiAction } from "@/lib/freeze-action-trace";

/** Allow the outgoing camera/editor DOM to retire and the navigation shell
 * to traverse two frame boundaries before mounting another GPU-heavy screen.
 * This is NOT a feature switch: every Settings control remains accessible.
 *
 * Previous fallback was only 180ms. On an Android WebView with a slow GPU
 * draw it could overtake the first actual frame and compete with its
 * HardwareRenderer.nSyncAndDrawFrame, reproducing a blocked Android main
 * thread. Hidden/background WebViews still enter after a bounded timeout.
 */
export function SettingsEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    traceUiAction("settings: prior tab released; two-paint boundary pending");
    const cancel = scheduleAfterPaintTask(() => {
      traceUiAction("settings: after two paint boundaries");
      setReady(true);
    }, 1100);
    return cancel;
  }, []);
  return ready ? <>{children}</> :
    <div role="status" className="studio-tab-loading p-5 text-center text-sm text-muted-foreground">Открываю настройки…</div>;
}
