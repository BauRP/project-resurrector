import { Capacitor } from "@capacitor/core";
import { uiFreeze } from "./ui-freeze-bridge";

/** Human-triggered milestones only. No timers, storage writes or camera work. */
export function traceUiAction(action: string): void {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("UiFreeze")) return;
  try {
    // The normal PluginCall trace can be queued behind a slow Camera2 HAL.
    // Keep the last action in JS memory for the separate native WebView probe.
    (window as Window & { __multicamFreezeLastAction?: string }).__multicamFreezeLastAction = action.slice(0, 96);
    void uiFreeze.trace({ action: action.slice(0, 96) }).catch(() => undefined);
  } catch {
    // Diagnostics may never prevent normal app interaction.
  }
}
