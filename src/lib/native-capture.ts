import {registerPlugin, type PluginListenerHandle} from "@capacitor/core";
export interface NativeCaptureStatus {
 state:string;message:string;startedAt:number;captureId?:number;stabilization:string;directPreviewActive?:boolean;
 cameraSensorFrames?:number;cameraSensorFps?:number;
 stabilizationCaptureResultObserved:boolean;savedBytes:number;
 recordingEisFrames?:number;recordingOisFrames?:number;
 recordingStabilizationOffFrames?:number;recordingStabilizationUnknownFrames?:number;
 savedUri:string;videoOnly:boolean;orientationDegrees?:number;
 cameraId?:string;width?:number;height?:number;fps?:number;recordedDurationMs?:number;
 audioRequested?:boolean;mp4TracksInspected?:boolean;mp4HasVideoTrack?:boolean;mp4HasAudioTrack?:boolean;
 mp4VideoWidth?:number;mp4VideoHeight?:number;
 mp4FirstFrameDecodable?:boolean;mp4TailFrameDecodable?:boolean;mp4AvStartOffsetMs?:number;mp4AvStartMeasured?:boolean;
 foldObservations?:number;foldPostureChanges?:number;foldGeometryOnlyChanges?:number;foldCheckpointsOmitted?:number;foldChangesWhilePaused?:number;foldObserverGap?:boolean;lastFoldAt?:number;
 foldNearbyCallbackGaps?:number;maxFoldNearbyCallbackGapMs?:number;
 mp4MiddleProbes?:number;mp4MiddleMatched?:number;mp4FoldProbes?:number;mp4FoldMatched?:number;
 mp4FoldPointsSkipped?:number;
 mp4CheckpointAuditCompleted?:boolean;
 mp4FoldPtsSpanChecks?:number;mp4FoldPtsLargeGaps?:number;mp4MaxFoldPtsGapMs?:number;
 mp4FoldAudioPtsSpanChecks?:number;mp4FoldAudioPtsLargeGaps?:number;mp4MaxFoldAudioPtsGapMs?:number;
 mp4AvDriftMeasured?:boolean;mp4AvDriftMs?:number;
 mp4AudioTimelineCompleted?:boolean;mp4AudioTimelineTrackFound?:boolean;mp4AudioTimelineSamples?:number;mp4AudioTimelineRollbacks?:number;mp4AudioTimelineDuplicates?:number;mp4AudioTimelineLargeGaps?:number;mp4AudioTimelineMaxGapMs?:number;
 mp4TimelineLimitReason?:string;mp4AudioTimelineLimitReason?:string;
 sensorTimestampDiscontinuities?:number;sensorTimestampRollbacks?:number;
 cameraCaptureFailureEvents?:number;foldNearbyCaptureFailureEvents?:number;
 cameraCallbackStallEpisodes?:number;maxCameraCallbackSilenceMs?:number;
 mp4LowFpsWindows?:number;
 mp4TimelineSampledFps?:number;
 mp4TimelineCompleted?:boolean;mp4TimelineSamples?:number;mp4TimelineRollbacks?:number;mp4TimelineDuplicates?:number;mp4TimelineLargeGaps?:number;mp4TimelineMaxGapMs?:number;
 mp4VideoSamples?:number;mp4AudioSamples?:number;mp4AudioPtsAnomalies?:number;mp4VideoTimestampRollbacks?:number;
 mp4DurationMs?:number;mp4TailVideoSamples?:number;mp4TailAudioSamples?:number;mp4TailAudioNearEnd?:boolean;mp4AvTailOffsetMeasured?:boolean;mp4AvTailOffsetMs?:number;mp4TailSampledFps?:number;mp4TailNearEnd?:boolean;
 mp4VideoTimestampDuplicates?:number;mp4VideoSampleLimitReached?:boolean;mp4SampledFps?:number;
 zoom?:number;maxZoom?:number;exposureIndex?:number;exposureMin?:number;exposureMax?:number;exposureStep?:number;
 torchAvailable?:boolean;torchEnabled?:boolean;
 tapAfSupported?:boolean;tapAeSupported?:boolean;tapX?:number;tapY?:number;tapSubmitted?:boolean;
 manualFocusSupported?:boolean;autoFocusSupported?:boolean;focusMode?:string;focusDiopters?:number;maxFocusDiopters?:number;reportedFocusDiopters?:number;reportedAfState?:number;
}
export interface NativeCaptureBridge {
 addListener(eventName:"directPreviewInvalidated",listener:(event:{ownerId:string;reason:string})=>void):Promise<PluginListenerHandle>;
 startPreview(options:{cameraId:string}):Promise<NativeCaptureStatus>;
 start(options:{cameraId:string;width:number;height:number;fps:number;audio:boolean}):Promise<NativeCaptureStatus>;
 stop():Promise<NativeCaptureStatus>;
 pause():Promise<NativeCaptureStatus>;
 resume():Promise<NativeCaptureStatus>;
 status():Promise<NativeCaptureStatus>;
 auditHistory():Promise<{entries:Array<Record<string,unknown>>;omittedEarlier:number;maxEntries:number}>;
 retryGalleryPublication():Promise<NativeCaptureStatus>;
 previewFrame():Promise<{jpeg:string;frameAt?:number}>;
 setDirectPreview(options:{ownerId:string;visible:boolean;left?:number;top?:number;width?:number;height?:number;viewportWidth?:number;viewportHeight?:number}):Promise<{visible:boolean}>;
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
 if(status.width&&status.height&&(!status.mp4VideoWidth||!status.mp4VideoHeight))return "unknown";
 if(status.audioRequested&&!status.mp4HasAudioTrack)return "missing-audio";
 if(status.width&&status.height&&status.mp4VideoWidth&&status.mp4VideoHeight&&
   (status.width!==status.mp4VideoWidth||status.height!==status.mp4VideoHeight))
   return "size-mismatch";
 return "complete";
}
