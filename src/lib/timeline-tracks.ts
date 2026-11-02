import { useCallback, useReducer, type SetStateAction } from "react";

export type TrackKind = "video" | "audio";
export interface TrackCounts { video: number; audio: number }
type TrackAction = { type: "add"; kind: TrackKind } | { type: "set"; kind: TrackKind; value: SetStateAction<number> };
export const initialTrackCounts: TrackCounts = { video: 1, audio: 1 };
export function trackReducer(state: TrackCounts, action: TrackAction): TrackCounts {
  const value = action.type === "add" ? state[action.kind] + 1 : typeof action.value === "function" ? action.value(state[action.kind]) : action.value;
  const count = Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
  return count === state[action.kind] ? state : { ...state, [action.kind]: count };
}
export function trackLanes(counts: TrackCounts) {
  return (["video", "audio"] as const).flatMap((kind) => Array.from({ length: counts[kind] }, (_, i) => ({
    key: `${kind === "video" ? "v" : "a"}${i + 1}`, kind, track: i + 1, label: kind === "video" ? "Video" : "Audio",
  })));
}
export function useTimelineTracks() {
  const [counts, dispatch] = useReducer(trackReducer, initialTrackCounts);
  const setVTracks = useCallback((value: SetStateAction<number>) => dispatch({ type: "set", kind: "video", value }), []);
  const setATracks = useCallback((value: SetStateAction<number>) => dispatch({ type: "set", kind: "audio", value }), []);
  const addTrack = useCallback((kind: TrackKind) => dispatch({ type: "add", kind }), []);
  return { vTracks: counts.video, aTracks: counts.audio, setVTracks, setATracks, addTrack };
}
export function timelineContentWidth(viewport: number, header: number, mediaEnd: number, zoom: number) {
  return mediaEnd > 0 ? Math.max(viewport, header + mediaEnd * zoom + 8) : viewport;
}
export function pinnedPlayhead(time: number, zoom: number, scroll: number, header: number) {
  return header + Math.max(scroll, Math.max(0, time) * zoom);
}