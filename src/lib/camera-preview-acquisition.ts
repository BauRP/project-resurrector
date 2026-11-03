import {bounded} from "./async";
import { diagnosticCaptureGate } from "./diagnostic-capture-gate";
import {cameraController,CameraBusyError,CameraSupersededError,CameraUnavailableError,checkAppliedCameraSetting} from "./camera-controller";
/** Only proved released Camera2 states allow WebView to compete for a lens.
 * error/interrupted/unknown states may still retain native sensor ownership.
 */
export function nativeCameraStateSafeForWebView(state:unknown):boolean {
  return state==="idle" || state==="saved";
}

/** Native Camera2 and WebView getUserMedia have different owners. A failed
 * status bridge is *not* evidence that Camera2 is idle. Check before opening,
 * again after getting a stream, and before a microphone-free fallback.
 * This prevents unsafe preview reopens on Activity recreation / folding.
 * A truly atomic cross-API lease still requires a native Camera2 interlock.
 */
export class NativeCameraBusyError extends CameraBusyError {
  constructor(){super();this.name="NativeCameraBusyError";}
}
/** Android WebView can return a different live lens despite exact deviceId.
 * Do not silently present it as the requested physical camera.
 */
export class CameraDeviceMismatchError extends Error {
  constructor(){super("WebView выбрал другой объектив вместо указанной камеры");this.name="CameraDeviceMismatchError";}
}
export function explicitVideoDeviceId(constraints: MediaStreamConstraints): string | null {
  const video=constraints.video;
  if (!video || typeof video !== "object") return null;
  const id=video.deviceId;
  if (!id || typeof id !== "object" || !("exact" in id)) return null;
  return typeof id.exact === "string" && !!id.exact ? id.exact : null;
}
export async function acquireWebViewPreviewWithNativeGuard(
  owner:symbol,
  constraints:MediaStreamConstraints,
  nativeStatus:(()=>Promise<{state:string}>)|null,
  options:{isCurrent?:()=>boolean;preempt?:boolean}={},
):Promise<MediaStream>{
  const current=options.isCurrent??(()=>true);
  const check=async()=>{
    if(!current())throw new CameraSupersededError();
    // This single shared lease also survives React/Activity remounts. It
    // prevents a preview from reopening while a diagnostic native operation
    // still owns the sensor or finalizes a recorded test file.
    if (diagnosticCaptureGate.activeOperation() !== null)
      throw new NativeCameraBusyError();
    if(!nativeStatus)return;
    const state=(await bounded(nativeStatus(),2000,"Native Camera2 owner")).state;
    if(!current())throw new CameraSupersededError();
    if (diagnosticCaptureGate.activeOperation() !== null)
      throw new NativeCameraBusyError();
    if(!nativeCameraStateSafeForWebView(state))
      throw new NativeCameraBusyError();
  };
  await check();
  let stream:MediaStream;
  try{
    stream=await cameraController.acquire(owner,constraints,options.preempt===undefined?{}:{preempt:options.preempt});
  }catch(error){
    // An Android bridge error or active native owner never goes through
    // this catch: those are checked above. Camera busy/cancelled and a
    // stream without video are not evidence of an audio-only failure.
    if(!current()||constraints.audio===false||
       error instanceof CameraBusyError ||
       error instanceof CameraSupersededError ||
       error instanceof CameraUnavailableError)throw error;
    await check();
    stream=await cameraController.acquire(owner,
      {...constraints,audio:false},options.preempt===undefined?{}:{preempt:options.preempt});
  }
  try{
    // Native Camera2 may have started while the WebView permission dialog
    // was open. Release only this acquired owner and never its successor.
    await check();
    const exactId = explicitVideoDeviceId(constraints);
    if (exactId && checkAppliedCameraSetting(stream.getVideoTracks()[0], "deviceId", exactId) === "rejected")
      throw new CameraDeviceMismatchError();
    return stream;
  }catch(error){
    cameraController.release(owner);
    throw error;
  }
}
