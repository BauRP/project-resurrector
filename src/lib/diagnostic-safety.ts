import { isNative, MultiCamNative, type NativeThermal } from "./native";

export interface DiagnosticSafety {
  proceed: boolean;
  reason: string;
  thermal: "safe" | "danger" | "unknown";
  battery: "safe" | "low" | "unknown";
  storage: "safe" | "low" | "unknown";
}
interface BatterySnapshot { level: number; charging: boolean }
export function evaluateDiagnosticSafety(input: {
  thermalStatus: number | null; battery: BatterySnapshot | null;
  freeBytes: number | null; extended: boolean;
}): DiagnosticSafety {
  const thermal = input.thermalStatus === null || input.thermalStatus < 0 ? "unknown" :
    input.thermalStatus >= 3 ? "danger" : "safe";
  const battery = !input.battery ? "unknown" :
    !input.battery.charging && input.battery.level < .15 ? "low" : "safe";
  const storage = input.freeBytes === null ? "unknown" :
    input.freeBytes < (input.extended ? 250 : 80) * 1024 * 1024 ? "low" : "safe";
  const reasons: string[] = [];
  if (thermal === "danger") reasons.push("Android сообщает о сильном нагреве");
  if (battery === "low") reasons.push("заряд ниже 15% без зарядки");
  if (storage === "low") reasons.push("недостаточно свободного места для диагностических клипов");
  return {
    proceed: reasons.length === 0,
    reason: reasons.length ? reasons.join("; ") :
      thermal === "unknown" || battery === "unknown" || storage === "unknown"
      ? "Проверка допустима, но часть показателей нагрузки неизвестна; результаты не считаются аппаратным стресс-тестом."
      : "Температура, питание и хранилище в допустимых пределах",
    thermal, battery, storage,
  };
}
/** With any unknown safety signal, do only one bounded video probe per
 * user-triggered invocation. Do not run an extensive camera/encoder sweep
 * without verified resource conditions. This does not silently mark modes
 * unsupported; the existing queue resumes later.
 */
export function diagnosticProbeLimit(safety: DiagnosticSafety, requested: number): number {
  if (!Number.isSafeInteger(requested) || requested <= 0 || !safety.proceed) return 0;
  if (safety.thermal === "unknown" || safety.battery === "unknown" ||
      safety.storage === "unknown") return 1;
  return requested;
}

/** Read only publicly exposed safety signals. No unavailable Android APIs or
 * guessed battery/temperature metrics are silently treated as healthy.
 */
export async function checkDiagnosticSafety(extended: boolean): Promise<DiagnosticSafety> {
  let thermalStatus: number | null = null;
  if (isNative()) {
    try {
      const t: NativeThermal = await MultiCamNative.getThermalStatus();
      thermalStatus = t.available !== false && t.status >= 0 ? t.status : null;
    } catch { /* unknown, not safe */ }
  }
  let battery: BatterySnapshot | null = null;
  try {
    const navigatorWithBattery = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
    };
    if (navigatorWithBattery.getBattery) {
      const value = await navigatorWithBattery.getBattery();
      if (Number.isFinite(value.level)) battery = { level: value.level, charging: value.charging };
    }
  } catch { /* not supported by this WebView */ }
  let freeBytes: number | null = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (estimate && typeof estimate.quota === "number" && typeof estimate.usage === "number")
      freeBytes = Math.max(0, estimate.quota - estimate.usage);
  } catch { /* quota is unknown */ }
  return evaluateDiagnosticSafety({ thermalStatus, battery, freeBytes, extended });
}
