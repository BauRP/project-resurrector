import { useEffect, useState, type ReactNode } from "react";
import { scheduleAfterResponsivePaint } from "@/lib/after-paint-task";
import { traceUiAction } from "@/lib/freeze-action-trace";
import { Capacitor } from "@capacitor/core";
import { uiFreeze } from "@/lib/ui-freeze-bridge";

/** Allow the outgoing camera/editor DOM to retire and the navigation shell
 * to traverse two frame boundaries before mounting another GPU-heavy screen.
 * This is NOT a feature switch: every Settings control remains accessible.
 *
 * Emulator #1587 proved that JavaScript rAF continues while Android HWUI
 * can spend 6s in SwapBuffers. Add a native WebView visual-state confirmation
 * BEFORE mounting Settings, then require more responsive JS frames. An
 * Android visual-state timeout retries rather than force-mounting Settings;
 * native recovery remains available if the renderer stays unhealthy.
 */
export function SettingsEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    traceUiAction("settings: prior tab released; two-paint boundary pending");
    let alive = true;
    let cancelAfterVisual: (() => void) | null = null;
    let retryVisual: ReturnType<typeof setTimeout> | null = null;
    const open = () => {
      if (!alive) return;
      traceUiAction("settings: renderer visual state reached");
      setReady(true);
    };
    const checkNativePaint = () => {
      if (!alive) return;
      if (document.hidden) { open(); return; }
      // A native timeout means the compositor is still busy: do not mount
      // the heavy Settings DOM merely because another rAF callback ran.
      void uiFreeze.awaitVisualState().then(result => {
        if (!alive) return;
        if (!result.ready) {
          traceUiAction("settings: native visual state timed out, retrying");
          retryVisual = setTimeout(checkNativePaint, 900);
          return;
        }
        traceUiAction("settings: native visual state ready");
        cancelAfterVisual = scheduleAfterResponsivePaint(open,
          { stableFrames: 2, maxFrameGapMs: 125, backgroundFallbackMs: 1800 });
      }).catch(() => {
        if (!alive) return;
        // Preserve Settings on compatible devices with an unsupported
        // optional diagnostics callback; use conservative JS frame fallback.
        traceUiAction("settings: visual state callback unavailable");
        cancelAfterVisual = scheduleAfterResponsivePaint(open,
          { stableFrames: 5, maxFrameGapMs: 125, backgroundFallbackMs: 1800 });
      });
    };
    const cancelFrames = scheduleAfterResponsivePaint(() => {
      if (!alive) return;
      if (!Capacitor.isNativePlatform() || document.hidden) {
        open();
        return;
      }
      checkNativePaint();
    }, { stableFrames: 3, maxFrameGapMs: 125, backgroundFallbackMs: 1800 });
    return () => {
      alive = false;
      cancelFrames();
      cancelAfterVisual?.();
      if (retryVisual !== null) clearTimeout(retryVisual);
    };
  }, []);
  return ready ? <>{children}</> :
    <div role="status" className="studio-tab-loading p-5 text-center text-sm text-muted-foreground">Открываю настройки…</div>;
}
