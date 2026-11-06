/** State transitions after CameraTab/Activity teardown. A lost encoder is
 * never a confirmed saved clip. Original recordings remain untouched. */
export type CapturePhase = "idle"|"starting"|"recording"|"stopping"|"saving"|"saved"|"error";
export const STALE_CAPTURE_MESSAGE = "Запись прервана или её завершение не подтверждено. Проверьте медиатеку. Сохранённые файлы не удалялись.";
export const isStaleCapture = (recording:boolean,phase:CapturePhase):boolean =>
  !recording && (phase==="recording"||phase==="starting");
export const interruptedOnCameraExit = (phase:CapturePhase,sessionActive:boolean):boolean =>
  sessionActive || phase==="recording" || phase==="starting" || phase==="stopping" || phase==="saving";
