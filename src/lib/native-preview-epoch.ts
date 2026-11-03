/** Async Camera2 TextureView placement acknowledgement is only valid if
 * the same fold/viewport epoch remains active. Android can finish a previous
 * "show" after WindowManager has moved the Activity to a cover panel.
 * Reject it before the UI considers the native preview safe.
 */
export function nativePreviewAckIsCurrent(
  submittedEpoch: number,
  currentEpoch: number,
  mounted: boolean,
  documentVisible: boolean,
  measuredPaneStillValid: boolean,
): boolean {
  return Number.isSafeInteger(submittedEpoch) &&
    Number.isSafeInteger(currentEpoch) &&
    submittedEpoch === currentEpoch &&
    mounted && documentVisible && measuredPaneStillValid;
}
