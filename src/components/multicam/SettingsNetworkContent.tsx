import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettingsStore } from "@/lib/multicam-store";
import { useMeshPeers } from "./useMesh";
import { useT } from "@/lib/i18n";
import { mesh } from "@/lib/mesh";
import { bounded } from "@/lib/async";
import { traceUiAction } from "@/lib/freeze-action-trace";

/**
 * Load mesh/WebRTC, DeviceMetrics and live peer observers only AFTER the first
 * Android Settings paint. They are not needed for language/theme controls.
 * Keep the complete network diagnostics functionality and user-visible rows.
 */
export function SettingsNetworkContent() {
  const s = useSettingsStore();
  const { t } = useT();
  const peers = useMeshPeers();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const diagnose = async () => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    setError("");
    traceUiAction("settings: network diagnosis");
    try {
      const result = await bounded(mesh.diagnose(), 3500, "Network diagnostics");
      if (mounted.current) s.set({ diagnostics: result });
    } catch {
      if (mounted.current) setError("Нет ответа от устройств. Проверьте соединение и повторите тест.");
    } finally {
      busy.current = false;
      if (mounted.current) setChecking(false);
    }
  };
  return <>
    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-border">
      <Stat label={t("latency").toUpperCase()} value={peers.length && s.diagnostics.latency ? `${s.diagnostics.latency} ms` : "—"} />
      <Stat label={t("status")} value={s.diagnostics.online ? "LOCAL" : "OFFLINE"} />
      <Stat label={t("bandwidth")} value="—" />
    </div>
    <div className="settings-item">
      <span className="flex items-center gap-3">
        <Activity className="text-status" /> {t("meshNodes")} · {peers.length + 1} · {mesh.localId ?? s.sessionCode}
      </span>
      <Button size="sm" variant="secondary" disabled={checking} onClick={() => void diagnose()}>
        {checking ? t("testing") : t("runTest")}
      </Button>
    </div>
    {error && <p role="alert" className="p-2 text-sm text-destructive">{error}</p>}
  </>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="bg-card p-3 text-center">
    <p className="text-[9px] text-muted-foreground">{label}</p>
    <p className="mt-1 text-sm font-semibold">{value}</p>
  </div>;
}
