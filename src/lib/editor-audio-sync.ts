/**
 * Keep every original audio lane synchronized to the editor playhead without
 * hammering Android WebView MediaCodec with repeated seek()/play() calls.
 * No audio streams are removed or downgraded. State is owned by each live
 * <audio> element, so unmounting a lane frees it automatically.
 */
interface AudioSyncState {
  wanted: boolean;
  lastTarget: number | null;
  lastCorrection: number;
  lastPlayAttempt: number;
  pendingPlay: Promise<void> | null;
}
const syncState = new WeakMap<HTMLAudioElement, AudioSyncState>();

export function syncEditorAudioElement(
  element: HTMLAudioElement,
  target: number,
  speed: number,
  shouldPlay: boolean,
  nowMs = performance.now(),
): void {
  let state = syncState.get(element);
  if (!state) {
    state = {
      wanted: false,
      lastTarget: null,
      lastCorrection: Number.NEGATIVE_INFINITY,
      lastPlayAttempt: Number.NEGATIVE_INFINITY,
      pendingPlay: null,
    };
    syncState.set(element, state);
  }
  const priorTarget = state.lastTarget;
  state.lastTarget = Number.isFinite(target) ? target : null;
  state.wanted = shouldPlay && Number.isFinite(target);
  if (!state.wanted) {
    if (!element.paused) element.pause();
    return;
  }
  if (element.playbackRate !== speed) element.playbackRate = speed;
  if (element.paused) {
    // One outstanding play request at a time, even when Android's media
    // stack needs several frames to prepare the decoder.
    if (state.pendingPlay || nowMs - state.lastPlayAttempt < 500) return;
    state.lastPlayAttempt = nowMs;
    if (!element.seeking) {
      try { element.currentTime = target; }
      catch { /* metadata/codec not ready */ }
    }
    try {
      const request = Promise.resolve(element.play()).then(
        () => {
          if (state.pendingPlay === request) state.pendingPlay = null;
          // If the user pressed Pause while Android was still preparing
          // the decoder, a late play resolution must not restart audio.
          if (!state.wanted && !element.paused) element.pause();
        },
        () => {
          if (state.pendingPlay === request) state.pendingPlay = null;
        },
      );
      state.pendingPlay = request;
    } catch {
      state.pendingPlay = null;
    }
    return;
  }
  const drift = Math.abs(element.currentTime - target);
  const explicitJump = priorTarget !== null && Math.abs(target - priorTarget) > 0.35;
  if (!element.seeking && drift > 0.3 &&
      (explicitJump || nowMs - state.lastCorrection >= 650)) {
    try {
      element.currentTime = target;
      state.lastCorrection = nowMs;
    } catch { /* seek not supported while codec is switching */ }
  }
}
