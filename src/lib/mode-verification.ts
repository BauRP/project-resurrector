import { cameraController, CameraBusyError, CameraSupersededError } from "./camera-controller";
import { recordModeEvidence, type ModeEvidence } from "./camera-passport";
import { verifyDecodedVideoBlob } from "./clip-playback";
export interface TestMode { width: number; height: number; fps: number }
export const TEST_MODES: readonly TestMode[] = [
  // Start with the common 1080p30 path, then a safer 720p30 fallback.
  // Neither is declared supported until actually tested on that lens.
  { width: 1920, height: 1080, fps: 30 },
  { width: 1280, height: 720, fps: 30 },
  { width: 1920, height: 1080, fps: 60 },
  { width: 2560, height: 1440, fps: 30 },
  { width: 3840, height: 2160, fps: 30 },
  { width: 3840, height: 2160, fps: 60 },
];
/** A plan derived from an ACTUAL WebView track is only a bounded list of
 * candidate combinations, never proof that any combination records.
 * The generic seeds are retained for WebViews that hide getCapabilities().
 */
export function candidateWebViewModes(
  capabilities: Pick<MediaTrackCapabilities,"width"|"height"|"frameRate"> | null | undefined,
  current?: Pick<MediaTrackSettings,"width"|"height"|"frameRate">,
): TestMode[] {
  // MediaTrackCapabilities ranges may omit min/max in the DOM typings.
  // Convert to an explicit finite pair so both runtime and TS can prove it.
  const validRange=(value: MediaSettingsRange | undefined):{min:number;max:number}|null => {
    const min=value?.min,max=value?.max;
    return typeof min==="number" && typeof max==="number" &&
      Number.isFinite(min) && Number.isFinite(max) &&
      min>0 && max>=min ? {min,max} : null;
  };
  const width=validRange(capabilities?.width),height=validRange(capabilities?.height);
  const frameRate=validRange(capabilities?.frameRate);
  if(!width||!height||!frameRate)return [...TEST_MODES];
  // These conventional sizes are candidates ONLY if they fit real per-track
  // ranges. An OEM can still reject any size/FPS combination at recording time.
  const sizes: [number,number][]=[
    [1920,1080],[1280,720],[640,480],[3840,2160],[2560,1440],
    [1920,1440],[1440,1080],[720,480],[320,240],
  ];
  if(Number.isSafeInteger(current?.width) && Number.isSafeInteger(current?.height) &&
      current!.width!>0 && current!.height!>0)
    sizes.unshift([current!.width!,current!.height!]);
  // Under the 24-mode cap, prioritize standard 30/60 FPS coverage across
  // all resolutions before optional cinema/broadcast rates.
  const fpsCandidates=[30,60,24,25,50,120];
  if(typeof current?.frameRate==="number" && Number.isFinite(current.frameRate) &&
      current.frameRate>0 && !fpsCandidates.some(f=>Math.abs(f-current.frameRate!)<0.5))
    fpsCandidates.unshift(Math.round(current.frameRate));
  const result:TestMode[]=[], seen=new Set<string>();
  const validSizes=sizes.filter(([w,h])=>
    w>=width.min&&w<=width.max&&h>=height.min&&h<=height.max);
  const validFps=fpsCandidates.filter(fps=>fps>=frameRate.min&&fps<=frameRate.max);
  // Round-robin ACROSS resolutions, not all FPS on the first resolution.
  // Otherwise a broad Android range can fill the 24-slot plan with
  // 1080p/720p and silently omit an advertised 2K or 4K candidate.
  for(const fps of validFps){
    for(const [w,h] of validSizes){
      const key=w+"|"+h+"|"+fps;
      if(seen.has(key))continue;
      seen.add(key);result.push({width:w,height:h,fps});
      if(result.length>=24)return result;
    }
  }
  // All reported bounds are valid. If they contain no known size/FPS, do
  // NOT reintroduce generic 1080p/4K modes outside those measured bounds.
  // Leave this device untested until an actual compatible mode is known.
  return result;
}

/** Inspect the specific WebView deviceId without evicting active recording.
 * Capture is released even on abort/time-out, and a hidden device identity
 * never earns a supported-mode claim. The returned list is a test PLAN only.
 */
export async function discoverWebViewModeCandidates(
  deviceId:string, signal:AbortSignal,
):Promise<{modes:TestMode[];source:"track"|"fallback";message:string}>{
  if(!deviceId || signal.aborted)return {modes:[],source:"fallback",message:"Проверка отменена"};
  const owner=Symbol("camera-candidate-discovery");
  try{
    const stream=await cameraController.acquire(owner,{
      video:{deviceId:{exact:deviceId}},audio:false,
    },{preempt:false});
    if(signal.aborted)return {modes:[],source:"fallback",message:"Проверка отменена"};
    const track=stream.getVideoTracks()[0];
    if(!track || track.readyState!=="live" || track.getSettings().deviceId!==deviceId)
      return {modes:[],source:"fallback",
        message:"Идентификатор WebView не подтверждён; очередь отложена"};
    const caps=track.getCapabilities?.();
    const candidates=candidateWebViewModes(caps,track.getSettings());
    // Empty list with genuine numeric bounds means no safely proposed mode.
    // Do not silently reinterpret it as a WebView API failure.
    const recognized=!!caps?.width && !!caps?.height && !!caps?.frameRate;
    return {modes:candidates,
      source:recognized?"track":"fallback",
      message:recognized?(candidates.length?
        "Кандидаты из getCapabilities(), ожидают проверки записи":
        "Измеренные диапазоны не содержат совместимых кандидатов; режимы отложены"):
        "WebView не раскрыл диапазоны; режимы пока не подтверждены"};
  }catch(error){
    if(signal.aborted)return {modes:[],source:"fallback",message:"Проверка отменена"};
    // A busy or failing camera cannot prove its available recording modes.
    // Return no tasks rather than taking over the user's live camera.
    return {modes:[],source:"fallback",
      message:"Диапазоны объектива временно недоступны; диагностика отложена: "+String(error)};
  }finally{cameraController.release(owner);}
}

// Diagnostics request video only: do not require an Opus audio encoder.
const MIMES = ["video/webm;codecs=vp8","video/webm;codecs=vp9","video/webm","video/mp4;codecs=avc1"];

export function decodedOutputMatchesRequested(
  mode: TestMode, output: { width: number; height: number },
): boolean {
  return (output.width === mode.width && output.height === mode.height) ||
    (output.width === mode.height && output.height === mode.width);
}
/** A decoded first frame verifies a file's frame dimensions, not the
 * frame rate of the encoded track. Until an independent coded-frame-rate
 * check exists, the mode stays RECORDED instead of fully VERIFIED.
 */
export function decodedVideoModeEvidence(
  mode: TestMode, frame: { width: number; height: number }, bytes: number,
): { state: "recorded" | "rejected"; message: string } {
  const exact = decodedOutputMatchesRequested(mode, frame);
  return {
    // An encoded file with the WRONG dimensions is not a successful
    // recording of the selected mode. Retest/offer the actual size instead.
    state: exact ? "recorded" : "rejected",
    message: exact
      ? "Видеофайл и размер первого кадра подтверждены (" + bytes + " байт, " +
        frame.width + "×" + frame.height +
        "). Частота кадров кодированного файла и все кадры ещё не проверены"
      : "Видеофайл декодирован, но размер кадра " + frame.width + "×" + frame.height +
        " отличается от выбранного " + mode.width + "×" + mode.height +
        "; этот режим записи не подтверждён",
  };
}
/** A stream of the requested resolution is not proof of which lens opened.
 * Some OEM WebViews omit deviceId; in that case preserve "unknown" rather than
 * assigning a video recording to a possibly different physical camera.
 */
export function isVerifiedCameraIdentity(requestedId: string, reportedId: unknown): boolean {
  return !!requestedId && typeof reportedId === "string" && reportedId === requestedId;
}
/** Only an explicitly unsatisfied camera constraint proves API-level incompatibility. */
export function classifyModeFailure(error: unknown, aborted: boolean): "unknown" | "rejected" {
  if (aborted || error instanceof CameraBusyError || error instanceof CameraSupersededError) return "unknown";
  if (!error || typeof error !== "object") return "unknown";
  const name = (error as { name?: unknown }).name;
  return name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError" ? "rejected" : "unknown";
}

/** One bounded, actual encoded sample; no fabricated tests or fake FPS claims.
 * The encoder must emit onstart before its output can prove a capture mode.
 */
export async function recordSample(stream: MediaStream, signal: AbortSignal): Promise<Blob> {
  if (typeof MediaRecorder === "undefined") throw new Error("MediaRecorder недоступен");
  const mime = MIMES.find(m => MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error("Подходящий видеокодировщик отсутствует");
  return new Promise<Blob>((resolve, reject) => {
    let recorder: MediaRecorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mime }); } catch (e) { reject(e); return; }
    const chunks: Blob[] = [];
    let done = false, started = false;
    let startTimer = 0, endTimer = 0, guard = 0;
    const finish = (failure?: Error) => {
      if (done) return;
      done = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(endTimer);
      window.clearTimeout(guard);
      signal.removeEventListener("abort", abort);
      recorder.onstart = null;
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (failure) reject(failure);
      else resolve(new Blob(chunks, { type: mime }));
    };
    const stopEncoder = () => {
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* A failed encoder may not stop normally. */ }
      }
    };
    const abort = () => {
      finish(new Error("Остановлено"));
      stopEncoder();
    };
    recorder.onstart = () => {
      if (done || started) return;
      started = true;
      window.clearTimeout(startTimer);
      // A late WebView onstart is not evidence of a timely recording.
      endTimer = window.setTimeout(stopEncoder, 1500);
    };
    recorder.ondataavailable = e => { if (!done && e.data.size) chunks.push(e.data); };
    recorder.onstop = () => finish(started ? undefined : new Error("Кодировщик не подтвердил запуск"));
    recorder.onerror = () => {
      finish(new Error("Сбой видеокодировщика"));
      stopEncoder();
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      if (signal.aborted) { abort(); return; }
      startTimer = window.setTimeout(() => {
        if (!started) {
          finish(new Error("Тайм-аут подтверждения запуска видеокодировщика"));
          stopEncoder();
        }
      }, 4000);
      guard = window.setTimeout(() => {
        finish(new Error("Тайм-аут записи"));
        stopEncoder();
      }, 8000);
      recorder.start(250);
    } catch (e) { finish(e instanceof Error ? e : new Error(String(e))); stopEncoder(); }
  });
}


export async function verifyMode(deviceId: string, mode: TestMode, signal: AbortSignal): Promise<ModeEvidence> {
  const owner = Symbol("mode-test");
  const result: ModeEvidence = {
    api: "webview", cameraId: deviceId, requested: mode, checkedAt: Date.now(), state: "unknown",
  };
  try {
    if (signal.aborted) throw new Error("Отменено");
    const stream = await cameraController.acquire(owner, {
      video: { deviceId: { exact: deviceId }, width: { exact: mode.width },
        height: { exact: mode.height }, frameRate: { exact: mode.fps } }, audio: false,
    }, { preempt: false });
    if (signal.aborted) throw new Error("Отменено");
    const track = stream.getVideoTracks()[0];
    if (!track || track.readyState !== "live") throw new Error("Камера не открылась");
    const actual = track.getSettings();
    result.applied = {
      ...(actual.width !== undefined ? {width:actual.width} : {}),
      ...(actual.height !== undefined ? {height:actual.height} : {}),
      ...(actual.frameRate !== undefined ? {fps:actual.frameRate} : {}),
    };
    const dimensionsMatch = (actual.width === mode.width && actual.height === mode.height) ||
      (actual.width === mode.height && actual.height === mode.width);
    const fpsKnown = typeof actual.frameRate === "number" && Number.isFinite(actual.frameRate);
    const fpsMatch = fpsKnown && Math.abs(actual.frameRate! - mode.fps) < 1.1;
    if (!isVerifiedCameraIdentity(deviceId, actual.deviceId)) {
      result.state = "unknown";
      result.message = actual.deviceId
        ? "WebView открыл другой идентификатор камеры; этот объектив не подтверждён"
        : "WebView не раскрыл идентификатор активной камеры; этот объектив не подтверждён";
    } else if (!dimensionsMatch || (fpsKnown && !fpsMatch)) {
      result.state = "rejected";
      result.message = "Фактическое разрешение или FPS отличаются от запрошенных";
    } else if (!fpsKnown) {
      result.state = "unknown";
      result.message = "WebView не сообщил фактический FPS: режим не подтверждён";
    } else {
      result.state = "applied";
      const blob = await recordSample(stream, signal);
      if (blob.size < 1024) throw new Error("Видео пустое");
      // Keep APPLIED until the saved video has passed an independent decode.
      // If the decoder fails, never persist a phantom RECORDED mode or let
      // the diagnostic queue skip its future retry.
      const frame = await verifyDecodedVideoBlob(blob, signal, 5000);
      if (signal.aborted) throw new Error("Проверка отменена");
      if (!frame.verifiedFirstFrame) throw new Error("Первый кадр не декодирован");
      result.file = { width: frame.width, height: frame.height, bytes: blob.size, mimeType: blob.type };
      // Real recorded codec FPS is not known from track.getSettings() or
      // a single decoded frame: never mark such an entire mode verified.
      const evidence = decodedVideoModeEvidence(mode, frame, blob.size);
      result.state = evidence.state;
      result.message = evidence.message;
    }
  } catch (e) {
    const reason = signal.aborted ? "Проверка отменена" :
      e instanceof Error ? e.message : String(e);
    // A failed encoder or first-frame decoder leaves only APPLIED evidence.
    // No successful RECORDED result was reached before decoding.
    const reached = result.state;
    result.state = signal.aborted ? "unknown" :
      reached === "recorded" || reached === "applied" ? reached :
      classifyModeFailure(e, false);
    result.message = reached === "applied" && !signal.aborted
      ? "Видеопоток настроен, но пробная запись или декодирование не подтверждены: " + reason
      : reason;
  } finally { cameraController.release(owner); }
  // Transient contention must not overwrite earlier confirmed hardware evidence.
  if (!signal.aborted && result.state !== "unknown") recordModeEvidence(result);
  return result;
}
