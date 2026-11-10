import { useSyncExternalStore } from "react";
import { mesh } from "@/lib/mesh";

const empty: never[] = [];
export function useMeshPeers() {
  return useSyncExternalStore(mesh.subscribe, mesh.getSnapshot, () => empty);
}

/** The app shell only shows the number of connected cameras. An incoming
 * ping/telemetry tick can replace the peer array without changing its count.
 * Subscribing to the count avoids rerendering the camera/editor/settings
 * shell for unrelated network housekeeping. Detailed peer UI is unchanged. */
const getPeerCount = () => mesh.getSnapshot().length;
const noPeers = () => 0;
export function useMeshPeerCount() {
  return useSyncExternalStore(mesh.subscribe, getPeerCount, noPeers);
}
