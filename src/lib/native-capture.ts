import {registerPlugin} from "@capacitor/core";
export interface NativeCaptureStatus {
 state:string;message:string;startedAt:number;stabilization:string;
 stabilizationCaptureResultObserved:boolean;savedBytes:number;
 savedUri:string;videoOnly:boolean;orientationDegrees?:number;
}
export interface NativeCaptureBridge {
 start(options:{cameraId:string;width:number;height:number;fps:number;audio:boolean}):Promise<NativeCaptureStatus>;
 stop():Promise<NativeCaptureStatus>;
 status():Promise<NativeCaptureStatus>;
 requestPermissions(options?:{permissions:string[]}):Promise<Record<string,string>>;
}
export const nativeCapture = registerPlugin<NativeCaptureBridge>("NativeCapture");
export const nativeRecorderOwnsCamera=(state:string):boolean=>
 ["starting","recording","stopping"].includes(state);
