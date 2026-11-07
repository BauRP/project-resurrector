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
 * BEFORE mounting Settings, then require more responsive JS frames. The
 * native recovery dialog stays available if Chromium never becomes healthy.
 */
export function SettingsEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    traceUiAction("settings: prior tab released; two-paint boundary pending");
    let alive = true;
    let cancelAfterVisual: (() => void) | null = null;
    const open = () => {
      if (!alive) return;
      traceUiAction("settings: renderer visual state reached");
      setReady(true);
    };
    const cancelFrames = scheduleAfterResponsivePaint(() => {
      if (!alive) return;
      if (!Capacitor.isNativePlatform() || document.hidden) {
        open();
        return;
      }
      // rAF only confirms JavaScript scheduling. An emulator can continue
      // issuing rAF while Android HWUI is blocked in SwapBuffers for seconds.
      // Confirm Chromium's actual visual pipeline before the Settings import.
      void uiFreeze.awaitVisualState().then(result => {
        if (!alive) return;
        traceUiAction(result.ready
          ? "settings: native visual state ready"
          : "settings: native visual state timeout");
        cancelAfterVisual = scheduleAfterResponsivePaint(open,
          { stableFrames: 2, maxFrameGapMs: 125, backgroundFallbackMs: 1800 });
      }).catch(() => {
        if (!alive) return;
        // An OEM that does not implement the callback still gets Settings;
        // preserve a second responsive-frame boundary as fallback.
        cancelAfterVisual = scheduleAfterResponsivePaint(open,
          { stableFrames: 5, maxFrameGapMs: 125, backgroundFallbackMs: 1800 });
      });
    }, { stableFrames: 3, maxFrameGapMs: 125, backgroundFallbackMs: 1800 });
    return () => {
      alive = false;
      cancelFrames();
      cancelAfterVisual?.();
    };
  }, []);
  return ready ? <>{children}</> :
    <div role="status" className="studio-tab-loading p-5 text-center text-sm text-muted-foreground">Открываю настройки…</div>;
}
