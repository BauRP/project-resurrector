import { useCallback, useReducer, type SetStateAction } from "react";
/** Empty lanes are real file attachment targets, never fake clips. */
export type TrackKind = "video" | "audio";
export interface TrackCounts { video: number; audio: number }
export type TrackAction = { type: "add"; kind: TrackKind } | { type: "set"; kind: TrackKind; value: SetStateAction<number> };
export const initialTrackCounts: TrackCounts = { video: 1, audio: 1 };
const clampCount = (value: number) => Number.isFinite(value) ? Math.max(1, Math.min(64, Math.floor(value))) : 1;
export function trackReducer(state: TrackCounts, action: TrackAction): TrackCounts {
  const value = action.type === "add" ? state[action.kind] + 1 :
    typeof action.value === "function" ? action.value(state[action.kind]) : action.value;
  const count = clampCount(value);
  return count === state[action.kind] ? state : { ...state, [action.kind]: count };
}
export function trackLanes(counts: TrackCounts) {
  return (["video", "audio"] as const).flatMap(kind => Array.from({ length: clampCount(counts[kind]) }, (_, i) => {
    const track = i + 1, noun = kind === "video" ? "Видео" : "Аудио";
    return { key: `${kind === "video" ? "v" : "a"}${track}`, kind, track,
      label: track === 1 ? noun : `${noun} ${track}` };
  }));
}
export function useTimelineTracks(initial: TrackCounts = initialTrackCounts) {
  const [counts, dispatch] = useReducer(trackReducer, initial,
    value => ({ video: clampCount(value.video), audio: clampCount(value.audio) }));
  const setVTracks = useCallback((value: SetStateAction<number>) => dispatch({ type: "set", kind: "video", value }), []);
  const setATracks = useCallback((value: SetStateAction<number>) => dispatch({ type: "set", kind: "audio", value }), []);
  const addTrack = useCallback((kind: TrackKind) => dispatch({ type: "add", kind }), []);
  return { vTracks: counts.video, aTracks: counts.audio, setVTracks, setATracks, addTrack };
}
export function timelineContentWidth(viewport: number, header: number, mediaEnd: number, zoom: number) {
  return mediaEnd > 0 ? Math.max(viewport, header + mediaEnd * zoom + 8) : viewport;
}
/** Never detach the red playhead from the actual time-zero origin. */
export function pinnedPlayhead(time: number, zoom: number, _scroll: number, header: number) {
  return Math.max(0, header + Math.max(0, time) * Math.max(0, zoom));
}
