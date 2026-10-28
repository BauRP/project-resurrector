import {registerPlugin} from "@capacitor/core";
export interface NativeCaptureStatus {
 state:string;message:string;startedAt:number;stabilization:string;
 stabilizationCaptureResultObserved:boolean;savedBytes:number;
 savedUri:string;videoOnly:boolean;orientationDegrees?:number;
 cameraId?:string;width?:number;height?:number;fps?:number;recordedDurationMs?:number;
 audioRequested?:boolean;mp4TracksInspected?:boolean;mp4HasVideoTrack?:boolean;mp4HasAudioTrack?:boolean;
 mp4VideoWidth?:number;mp4VideoHeight?:number;
 zoom?:number;maxZoom?:number;exposureIndex?:number;exposureMin?:number;exposureMax?:number;exposureStep?:number;
 torchAvailable?:boolean;torchEnabled?:boolean;
 tapAfSupported?:boolean;tapAeSupported?:boolean;tapX?:number;tapY?:number;tapSubmitted?:boolean;
 manualFocusSupported?:boolean;autoFocusSupported?:boolean;focusMode?:string;focusDiopters?:number;maxFocusDiopters?:number;reportedFocusDiopters?:number;reportedAfState?:number;
}
export interface NativeCaptureBridge {
 startPreview(options:{cameraId:string}):Promise<NativeCaptureStatus>;
 start(options:{cameraId:string;width:number;height:number;fps:number;audio:boolean}):Promise<NativeCaptureStatus>;
 stop():Promise<NativeCaptureStatus>;
 pause():Promise<NativeCaptureStatus>;
 resume():Promise<NativeCaptureStatus>;
 status():Promise<NativeCaptureStatus>;
 previewFrame():Promise<{jpeg:string;frameAt?:number}>;
 setControls(options:{zoom:number;exposureIndex:number}):Promise<NativeCaptureStatus>;
 setTorch(options:{enabled:boolean}):Promise<NativeCaptureStatus>;
 setFocus(options:{manual:boolean;diopters:number}):Promise<NativeCaptureStatus>;
 tapToMeter(options:{x:number;y:number}):Promise<NativeCaptureStatus>;
 setPreviewVisible(options:{visible:boolean;ownerId:string}):Promise<void>;
 requestPermissions(options?:{permissions:string[]}):Promise<Record<string,string>>;
}
export const nativeCapture = registerPlugin<NativeCaptureBridge>("NativeCapture");
export const nativeRecorderOwnsCamera=(state:string):boolean=>
 ["starting","previewing","recording","paused","stopping"].includes(state);

/** Native MP4 headers are read only after MediaRecorder finalizes.
 * An unavailable parser must never become false proof of no audio.
 */
export function nativeMp4TrackStatus(
 status:Pick<NativeCaptureStatus,"audioRequested"|"mp4TracksInspected"|"mp4HasVideoTrack"|"mp4HasAudioTrack"|"mp4VideoWidth"|"mp4VideoHeight"|"width"|"height">,
): "unknown"|"complete"|"missing-video"|"missing-audio"|"size-mismatch" {
 if(!status.mp4TracksInspected)return "unknown";
 if(!status.mp4HasVideoTrack)return "missing-video";
 if(status.audioRequested&&!status.mp4HasAudioTrack)return "missing-audio";
 if(status.width&&status.height&&status.mp4VideoWidth&&status.mp4VideoHeight&&
   (status.width!==status.mp4VideoWidth||status.height!==status.mp4VideoHeight))
   return "size-mismatch";
 return "complete";
}
