import { useSyncExternalStore } from "react";
import { mesh } from "@/lib/mesh";

const empty: never[] = [];
export function useMeshPeers() {
  return useSyncExternalStore(mesh.subscribe, mesh.getSnapshot, () => empty);
}
