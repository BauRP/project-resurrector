import { registerPlugin } from "@capacitor/core";

export interface UiFreezeBridge {
  trace(options: { action: string }): Promise<void>;
  read(): Promise<{ report: string; recordedAt: number }>;
  clear(): Promise<void>;
  pulse(): Promise<void>;
  awaitVisualState(): Promise<{ ready: boolean; elapsedMs: number; phase?: "frame_committed" | "visual_state_only" | "timeout" }>;
  copyReport(options: { report: string }): Promise<void>;
}

/**
 * Register UiFreeze exactly once. Multiple registerPlugin("UiFreeze") calls
 * across lazy-loaded React chunks emitted duplicate registration warnings
 * during Settings navigation and added unnecessary bridge initialization.
 */
export const uiFreeze = registerPlugin<UiFreezeBridge>("UiFreeze");
