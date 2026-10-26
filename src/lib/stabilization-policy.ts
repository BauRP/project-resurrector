import type { StabilizationProbeResult } from "./stabilization-probe";

/** Advisory stabilization policy based only on the measured Camera2 TEST
 * session. The application records video through a different WebView pipeline,
 * so even a confirmed CaptureResult is not evidence that the final file uses
 * the same OIS/EIS mode. Do not enable a fictional stabilizer.
 */
export type StabilizationRecommendation =
  "prefer-eis" | "prefer-ois" | "evaluate-software" | "unknown";
export interface StabilizationDecision {
  recommendation: StabilizationRecommendation;
  systemState: "test-confirmed" | "explicitly-unavailable" | "unknown";
  disableAdditionalProcessing: boolean;
  message: string;
}
export function decideStabilizationForRecordedMode(
  probe: StabilizationProbeResult | null | undefined,
  mode: {cameraId:string;width:number;height:number;fps:number},
): StabilizationDecision {
  const unknown = (message = "Системная стабилизация: состояние неизвестно. Проверка Camera2 для текущего режима отсутствует."): StabilizationDecision => ({
    recommendation:"unknown",systemState:"unknown",disableAdditionalProcessing:false,message,
  });
  if (!probe || !mode.cameraId || probe.cameraId !== mode.cameraId ||
      probe.width !== mode.width || probe.height !== mode.height ||
      probe.fpsRequested !== mode.fps) return unknown();
  if (probe.state === "capture-result-confirmed") {
    if (probe.selected === "eis" || probe.selected === "preview-stabilization")
      return {recommendation:"prefer-eis",systemState:"test-confirmed",
        disableAdditionalProcessing:true,
        message:"EIS подтверждена только в тестовой Camera2-сессии. Для реальной WebView-записи режим ещё не проверен; дополнительную стабилизацию одновременно не включать."};
    if (probe.selected === "ois")
      return {recommendation:"prefer-ois",systemState:"test-confirmed",
        disableAdditionalProcessing:true,
        message:"OIS подтверждена в тестовой Camera2-сессии. Файл WebView-записи пока не подтверждает её работу; дополнительную обработку по умолчанию не включать."};
  }
  // "not-confirmed" may merely mean no usable CaptureResult or camera busy.
  // Absence of declarations is NOT enough unless the native probe explicitly
  // classified them as unavailable on this exact tested lens/mode.
  if (probe.state === "declared-unavailable" &&
      !probe.eisDeclared && !probe.previewDeclared && !probe.oisDeclared)
    return {recommendation:"evaluate-software",systemState:"explicitly-unavailable",
      disableAdditionalProcessing:false,
      message:"Camera2 явно не объявляет EIS/OIS в тестовом режиме. Программную стабилизацию можно лишь предложить для отдельного испытания нагрузки; она пока не подтверждена."};
  return unknown("Системная стабилизация: состояние неизвестно или не подтверждено для видеозаписи. Не обозначать её как отсутствующую.");
}
