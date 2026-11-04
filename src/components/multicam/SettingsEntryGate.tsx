import { useEffect, useState, type ReactNode } from "react";
import { traceUiAction } from "@/lib/freeze-action-trace";

/** Settings navigation occupies its own paint before mounting Settings.
 * Camera/editor teardown and native TextureView release must not compete
 * with the initial Settings DOM/layout work in the same React commit.
 * Both modules remain fully functional; this is a scheduling boundary,
 * not a skip of permissions, hardware features or Settings controls.
 */
export function SettingsEntryGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    let frame = 0;
    let afterFrame = 0;
    const enter = () => {
      if (!live) return;
      live = false;
      window.clearTimeout(fallback);
      traceUiAction("settings: render after prior tab release");
      setReady(true);
    };
    traceUiAction("settings: prior tab released; paint pending");
    frame = window.requestAnimationFrame(() => {
      // Task after rAF: allow Chromium to paint the persistent navigation
      // before decoding/mounting the lazy Settings chunk.
      afterFrame = window.setTimeout(enter, 0);
    });
    // Some emulator WebViews suppress rAF during brief Activity focus loss.
    // The fallback guarantees that Settings itself is never inaccessible.
    const fallback = window.setTimeout(enter, 180);
    return () => {
      live = false;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(afterFrame);
      window.clearTimeout(fallback);
    };
  }, []);
  return ready ? <>{children}</> :
    <div role="status" className="studio-tab-loading p-5 text-center text-sm text-muted-foreground">Открываю настройки…</div>;
}
