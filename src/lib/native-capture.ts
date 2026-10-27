import {registerPlugin} from "@capacitor/core";
export interface NativeCaptureStatus {
 state:string;message:string;startedAt:number;stabilization:string;
 stabilizationCaptureResultObserved:boolean;savedBytes:number;
 savedUri:string;videoOnly:boolean;orientationDegrees?:number;
 cameraId?:string;width?:number;height?:number;fps?:number;recordedDurationMs?:number;
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
 previewFrame():Promise<{jpeg:string}>;
 setControls(options:{zoom:number;exposureIndex:number}):Promise<NativeCaptureStatus>;
 setTorch(options:{enabled:boolean}):Promise<NativeCaptureStatus>;
 setFocus(options:{manual:boolean;diopters:number}):Promise<NativeCaptureStatus>;
 tapToMeter(options:{x:number;y:number}):Promise<NativeCaptureStatus>;
 setPreviewVisible(options:{visible:boolean}):Promise<void>;
 requestPermissions(options?:{permissions:string[]}):Promise<Record<string,string>>;
}
export const nativeCapture = registerPlugin<NativeCaptureBridge>("NativeCapture");
export const nativeRecorderOwnsCamera=(state:string):boolean=>
 ["starting","previewing","recording","paused","stopping"].includes(state);
