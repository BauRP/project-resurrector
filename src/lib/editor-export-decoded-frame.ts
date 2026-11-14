/**
 * Android WebView can report video metadata while MediaCodec has not yet
 * decoded a frame, or temporarily lose the decoded surface after seeking.
 * Never pass such frames to Canvas.drawImage: an uncaught exception inside
 * requestAnimationFrame otherwise leaves the exporter waiting for its watchdog.
 */
export function isEditorDecodedFrameReady(
  video: Pick<HTMLVideoElement, "readyState" | "videoWidth" | "videoHeight">,
): boolean {
  return video.readyState >= 2 &&
    Number.isFinite(video.videoWidth) && video.videoWidth > 0 &&
    Number.isFinite(video.videoHeight) && video.videoHeight > 0;
}
