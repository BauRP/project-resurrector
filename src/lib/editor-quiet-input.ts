/**
 * Android 9 WebView can lock its renderer when 24fps proxy encoding starts
 * while a 15-second clip is playing or the user repeatedly taps the editor.
 * Defer only OPTIONAL proxy generation, not preview, export or controls.
 */
export function waitForEditorQuietInput(
 signal: AbortSignal, isPlaying: () => boolean, quietMs = 1500,
): Promise<boolean> {
 if (signal.aborted) return Promise.resolve(false);
 if (typeof window === "undefined") return Promise.resolve(true);
 return new Promise(resolve => {
   let done = false;
   let lastInput = Date.now();
   let timer: ReturnType<typeof setTimeout> | null = null;
   const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
   const onInput = () => { lastInput = Date.now(); };
   const finish = (ok: boolean) => {
     if (done) return;
     done = true;
     if (timer !== null) clearTimeout(timer);
     for (const event of events) window.removeEventListener(event, onInput, true);
     signal.removeEventListener("abort", onAbort);
     resolve(ok && !signal.aborted);
   };
   const onAbort = () => finish(false);
   const check = () => {
     if (signal.aborted) return finish(false);
     if (!isPlaying() && Date.now() - lastInput >= quietMs) return finish(true);
     timer = setTimeout(check, 250);
   };
   for (const event of events) window.addEventListener(event, onInput, { capture: true, passive: true });
   signal.addEventListener("abort", onAbort, { once: true });
   timer = setTimeout(check, quietMs);
   if (signal.aborted) onAbort();
 });
}
