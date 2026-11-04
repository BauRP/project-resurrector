import { Capacitor, registerPlugin } from "@capacitor/core";

type TraceBridge = { trace(options: { action: string }): Promise<void> };
const monitor = registerPlugin<TraceBridge>("UiFreeze");

/** Human-triggered milestones only. No timers, storage writes or camera work. */
export function traceUiAction(action: string): void {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("UiFreeze")) return;
  try {
    void monitor.trace({ action: action.slice(0, 96) }).catch(() => undefined);
  } catch {
    // Diagnostics may never prevent normal app interaction.
  }
}
