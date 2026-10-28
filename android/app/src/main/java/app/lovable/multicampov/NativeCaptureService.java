
package app.lovable.multicampov;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.database.Cursor;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.CaptureResult;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.hardware.camera2.params.MeteringRectangle;
import android.media.MediaRecorder;
import android.media.ImageReader;
import android.media.Image;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import java.util.ArrayList;
import android.media.MediaMetadataRetriever;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.provider.MediaStore;
import android.util.Range;
import android.util.Size;
import android.view.Surface;
import android.graphics.SurfaceTexture;
import android.view.WindowManager;
import androidx.core.app.NotificationCompat;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.Arrays;

/**
 * A real Camera2 recorder owned by an Android foreground Service, not WebView.
 * Only explicitly user-started normal-speed single-camera video is supported.
 * Video and audio, if requested, use a single native MediaRecorder/MP4 pipeline.
 * Activity recreation does not destroy a started Service, but OS process death
 * still may interrupt recording. Never claim this as guaranteed continuity.
 */
public class NativeCaptureService extends Service {
    public static final String ACTION_START = "app.lovable.multicampov.NATIVE_START";
    public static final String ACTION_PREVIEW = "app.lovable.multicampov.NATIVE_PREVIEW";
    public static final String ACTION_STOP = "app.lovable.multicampov.NATIVE_STOP";
    public static final String ACTION_PAUSE = "app.lovable.multicampov.NATIVE_PAUSE";
    public static final String ACTION_RESUME = "app.lovable.multicampov.NATIVE_RESUME";
    private static final String CHANNEL = "multicam_native_capture";
    private static final int NOTIFICATION = 2017;
    private static final String STORE = "native_capture_v1";
    private static final Object STATE_LOCK = new Object();
    private static NativeCaptureService runningInstance;
    // A preview consumer can mount before the foreground service is created.
    // A stale WebView teardown must not hide a newer camera view.
    private static String previewOwnerId;
    private static String directPreviewOwnerId;
    private static SurfaceTexture directPreviewTexture;
    private static boolean directPreviewActive = false;
    private static String state = "idle";
    private static String lastMessage = "Нативная запись не запускалась";
    private static String savedPath = "";
    private static String savedUri = "";
    private static String chosenStabilization = "unknown";
    private static boolean stabilizationResultSeen = false;
    private static long recordingStartedAt = 0L;
    private static int recordedOrientation = -1;
    private static String selectedCameraId = "";
    private static int selectedWidth = 0, selectedHeight = 0, selectedFps = 0;
    private static long pausedAtMs = 0L, totalPausedMs = 0L, finishedDurationMs = 0L;
    // Post-encoder MP4 inspection, not requested Camera2 or preview settings.
    private static boolean mp4TracksInspected = false;
    private static boolean mp4HasAudioTrack = false;
    private static boolean mp4HasVideoTrack = false;
    private static int mp4VideoWidth = 0, mp4VideoHeight = 0;
    private static int mp4VideoSamples = 0, mp4AudioSamples = 0;
    private static int mp4VideoTimestampRollbacks = 0, mp4VideoTimestampDuplicates = 0;
    private static boolean mp4VideoSampleLimitReached = false;
    private static float mp4SampledFps = -1f;
    private static long mp4DurationMs = -1L;
    private static int mp4TailVideoSamples = 0;
    private static float mp4TailSampledFps = -1f;
    private static boolean mp4TailNearEnd = false;
    private static final int MP4_SCAN_SAMPLES_PER_TRACK = 512;

    private HandlerThread workerThread;
    private Handler worker;
    // JPEG conversion is optional and expensive. Never run it on the Camera2
    // control/capture-callback thread that also owns MP4 recording state.
    private HandlerThread previewThread;
    private Handler previewHandler;
    private CameraDevice camera;
    private CameraCaptureSession capture;
    private MediaRecorder encoder;
    private volatile ImageReader previewReader;
    private Surface activeDirectPreviewSurface;
    private volatile boolean previewConsumerVisible;
    /** An Activity contributes only a surface, not a second Camera2 owner.
     * Unmounting its surface cannot terminate a MediaRecorder session.
     */
    public static void setDirectPreviewTexture(String ownerId, SurfaceTexture texture) {
        if (ownerId == null || ownerId.isEmpty()) return;
        synchronized (STATE_LOCK) {
            if (texture != null) {
                directPreviewOwnerId = ownerId;
                directPreviewTexture = texture;
            } else if (ownerId.equals(directPreviewOwnerId)) {
                directPreviewOwnerId = null;
                directPreviewTexture = null;
                NativeCaptureService service = runningInstance;
                if (service != null && directPreviewActive &&
                    "previewing".equals(state) && service.encoder == null &&
                    service.worker != null) {
                    // A detached SurfaceTexture is unusable. Only preview-only
                    // sessions stop; actual video recording is never stopped.
                    service.worker.post(() -> {
                        if ("previewing".equals(state) && service.encoder == null)
                            service.finish();
                    });
                }
            }
        }
    }
    public static void setPreviewConsumerVisible(boolean visible, String ownerId) {
        if (ownerId == null || ownerId.isEmpty()) return;
        synchronized (STATE_LOCK) {
            if (visible) {
                previewOwnerId = ownerId;
                if (runningInstance != null) runningInstance.previewConsumerVisible = true;
            } else if (ownerId.equals(previewOwnerId)) {
                previewOwnerId = null;
                if (runningInstance != null) {
                    runningInstance.previewConsumerVisible = false;
                    runningInstance.latestPreviewJpeg = null;
                }
            }
        }
    }
    private volatile String latestPreviewJpeg;
    private volatile long latestPreviewAt;
    private volatile long lastPreviewAttemptAt;
    private void onPreviewImage(ImageReader reader) {
        Image frame = null;
        try {
            // acquireLatestImage drops buffered older frames rather than
            // building a JPEG conversion backlog while the phone folds.
            frame = reader.acquireLatestImage();
            if (frame == null || reader != previewReader || !previewConsumerVisible) return;
            long now = System.currentTimeMillis();
            if (now - lastPreviewAttemptAt < 240) return;
            lastPreviewAttemptAt = now;
            String jpeg = NativePreviewFrames.compressYuv420(frame);
            // The old session may have been closed or the viewer unmounted
            // while a slow OEM YUV conversion was running.
            if (jpeg != null && previewConsumerVisible && reader == previewReader) {
                latestPreviewJpeg = jpeg;
                latestPreviewAt = System.currentTimeMillis();
            }
        } catch (Exception ignored) {
            // Optional preview must never fail an otherwise valid MP4.
        } finally {
            if (frame != null) try { frame.close(); } catch (Exception ignored) {}
        }
    }
    private File media;
    private boolean encoderStarted;
    private boolean encoderPaused;
    private boolean stopRequested;
    private boolean wantAudio;
    private boolean interruptedByCamera;
    private int generation = 0;
    private Runnable openingTimeout;
    private CaptureRequest.Builder liveRequest;
    private CameraCaptureSession.CaptureCallback liveCallback;
    private Rect activeSensor;
    private float maxDigitalZoom = 1f, requestedZoom = 1f;
    private Range<Integer> exposureRange = new Range<>(0,0);
    private int requestedExposure = 0;
    private float exposureStep = 0f;
    private boolean torchAvailable, torchEnabled;
    private boolean manualFocusSupported, autoFocusSupported;
    private float maxFocusDiopters, requestedFocusDiopters;
    private boolean manualFocus;
    private int automaticAfMode = CaptureRequest.CONTROL_AF_MODE_OFF;
    private volatile float reportedFocusDiopters = -1f;
    private volatile int reportedAfState = -1;
    private int maxAfRegions=0, maxAeRegions=0;
    private float focusTapX=Float.NaN, focusTapY=Float.NaN;
    private volatile boolean focusTapSubmitted=false;
    private boolean focusTapAf=false,focusTapAe=false;

    public static com.getcapacitor.JSObject previewFrame() {
        com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
        synchronized (STATE_LOCK) {
            NativeCaptureService service = runningInstance;
            if (service != null && service.latestPreviewJpeg != null
                && System.currentTimeMillis() - service.latestPreviewAt < 3000) {
                result.put("jpeg", service.latestPreviewJpeg);
                result.put("frameAt", service.latestPreviewAt);
            } else {
                result.put("jpeg", "");
                result.put("frameAt", 0L);
            }
        }
        return result;
    }
    public static boolean updateControls(float zoom, int evIndex,
        java.util.function.Consumer<Boolean> completed) {
        synchronized (STATE_LOCK) {
            NativeCaptureService owner = runningInstance;
            if (owner == null || owner.worker == null ||
                !("previewing".equals(state) || "recording".equals(state) ||
                  "paused".equals(state))) return false;
            if (!Float.isFinite(zoom) || zoom < 1f || zoom > owner.maxDigitalZoom ||
                evIndex < owner.exposureRange.getLower() ||
                evIndex > owner.exposureRange.getUpper()) return false;
            return owner.worker.post(() -> completed.accept(owner.applyControls(zoom,evIndex)));
        }
    }
    private void configureControlLimits(CameraCharacteristics characteristics) {
        Integer afLimit=characteristics.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AF);
        Integer aeLimit=characteristics.get(CameraCharacteristics.CONTROL_MAX_REGIONS_AE);
        maxAfRegions=Math.max(0,afLimit==null?0:afLimit);
        maxAeRegions=Math.max(0,aeLimit==null?0:aeLimit);
        if(maxAfRegions==0&&!autoFocusSupported)focusTapAf=false;
        if(maxAeRegions==0)focusTapAe=false;
        Float minimumDistance=characteristics.get(
            CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
        int[] afModes=characteristics.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
        boolean hasAfOff=false, hasAuto=false, hasVideo=false, hasPicture=false;
        if(afModes!=null)for(int candidate:afModes){
            if(candidate==CaptureRequest.CONTROL_AF_MODE_OFF)hasAfOff=true;
            if(candidate==CaptureRequest.CONTROL_AF_MODE_AUTO)hasAuto=true;
            if(candidate==CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO)hasVideo=true;
            if(candidate==CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE)hasPicture=true;
        }
        autoFocusSupported=hasAuto||hasVideo||hasPicture;
        automaticAfMode=hasVideo?CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO:
            hasPicture?CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE:
            hasAuto?CaptureRequest.CONTROL_AF_MODE_AUTO:CaptureRequest.CONTROL_AF_MODE_OFF;
        maxFocusDiopters=minimumDistance==null?0f:Math.max(0f,minimumDistance);
        manualFocusSupported=hasAfOff && maxFocusDiopters>0f;
        if(!manualFocusSupported)manualFocus=false;
        requestedFocusDiopters=Math.max(0f,Math.min(requestedFocusDiopters,maxFocusDiopters));
        reportedFocusDiopters=-1f;
        reportedAfState=-1;
        Boolean flash=characteristics.get(CameraCharacteristics.FLASH_INFO_AVAILABLE);
        torchAvailable=Boolean.TRUE.equals(flash);
        if(!torchAvailable)torchEnabled=false;
        Float maximum=characteristics.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM);
        Rect region=characteristics.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE);
        Range<Integer> exposure=characteristics.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE);
        android.util.Rational step=characteristics.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP);
        activeSensor=region;
        maxDigitalZoom=region==null?1f:Math.max(1f,Math.min(20f,maximum==null?1f:maximum));
        exposureRange=exposure==null?new Range<>(0,0):exposure;
        exposureStep=step==null?0f:step.floatValue();
        requestedZoom=Math.max(1f,Math.min(requestedZoom,maxDigitalZoom));
        requestedExposure=Math.max(exposureRange.getLower(),
            Math.min(requestedExposure,exposureRange.getUpper()));
    }
    private Rect currentSensorCrop(){
        if(activeSensor==null)return null;
        if(requestedZoom<=1.005f)return new Rect(activeSensor);
        int width=Math.max(2,(int)(activeSensor.width()/requestedZoom));
        int height=Math.max(2,(int)(activeSensor.height()/requestedZoom));
        int left=activeSensor.left+(activeSensor.width()-width)/2;
        int top=activeSensor.top+(activeSensor.height()-height)/2;
        return new Rect(left,top,left+width,top+height);
    }
    private MeteringRectangle tapRegion(){
        Rect zoomCrop=currentSensorCrop();
        if(zoomCrop==null||!Float.isFinite(focusTapX)||!Float.isFinite(focusTapY))
            return null;
        // Camera2 YUV preview frames are delivered in sensor orientation without
        // a CSS rotation or mirroring. Match the stream center crop to the
        // selected active sensor crop; never include fold hinge/screen margins.
        Rect visible=new Rect(zoomCrop);
        if(previewReader!=null){
            float frameRatio=(float)previewReader.getWidth()/previewReader.getHeight();
            float cropRatio=(float)visible.width()/visible.height();
            if(cropRatio>frameRatio){
                int width=Math.max(2,Math.round(visible.height()*frameRatio));
                visible.left+=(visible.width()-width)/2;visible.right=visible.left+width;
            }else if(cropRatio<frameRatio){
                int height=Math.max(2,Math.round(visible.width()/frameRatio));
                visible.top+=(visible.height()-height)/2;visible.bottom=visible.top+height;
            }
        }
        int centerX=visible.left+Math.round(focusTapX*visible.width());
        int centerY=visible.top+Math.round(focusTapY*visible.height());
        int boxWidth=Math.max(2,Math.round(visible.width()*.12f));
        int boxHeight=Math.max(2,Math.round(visible.height()*.12f));
        boxWidth=Math.min(boxWidth,zoomCrop.width());
        boxHeight=Math.min(boxHeight,zoomCrop.height());
        int x=Math.max(zoomCrop.left,Math.min(centerX-boxWidth/2,zoomCrop.right-boxWidth));
        int y=Math.max(zoomCrop.top,Math.min(centerY-boxHeight/2,zoomCrop.bottom-boxHeight));
        return new MeteringRectangle(x,y,boxWidth,boxHeight,
            MeteringRectangle.METERING_WEIGHT_MAX);
    }
    private void setRequestControls(CaptureRequest.Builder request) {
        if(request==null)return;
        request.set(CaptureRequest.CONTROL_AF_MODE,
            manualFocus?CaptureRequest.CONTROL_AF_MODE_OFF:automaticAfMode);
        if(manualFocus && manualFocusSupported)
            request.set(CaptureRequest.LENS_FOCUS_DISTANCE,requestedFocusDiopters);
        if(torchAvailable)request.set(CaptureRequest.FLASH_MODE,
            torchEnabled?CaptureRequest.FLASH_MODE_TORCH:CaptureRequest.FLASH_MODE_OFF);
        if (request==null)return;
        if (activeSensor!=null && requestedZoom>1.005f) {
            int width=Math.max(2,(int)(activeSensor.width()/requestedZoom));
            int height=Math.max(2,(int)(activeSensor.height()/requestedZoom));
            int left=activeSensor.left+(activeSensor.width()-width)/2;
            int top=activeSensor.top+(activeSensor.height()-height)/2;
            request.set(CaptureRequest.SCALER_CROP_REGION,
                new Rect(left,top,left+width,top+height));
        } else if(activeSensor!=null) {
            request.set(CaptureRequest.SCALER_CROP_REGION,activeSensor);
        }
        if(exposureRange!=null)
            request.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION,requestedExposure);
        MeteringRectangle region=tapRegion();
        if(region!=null){
            if(focusTapAf&&maxAfRegions>0&&!manualFocus)
                request.set(CaptureRequest.CONTROL_AF_REGIONS,new MeteringRectangle[]{region});
            if(focusTapAe&&maxAeRegions>0)
                request.set(CaptureRequest.CONTROL_AE_REGIONS,new MeteringRectangle[]{region});
        }
    }
    private boolean applyControls(float zoom,int evIndex) {
        if(liveRequest==null || capture==null || camera==null || stopRequested)return false;
        float previousZoom=requestedZoom;
        int previousEv=requestedExposure;
        requestedZoom=zoom;requestedExposure=evIndex;
        try {
            setRequestControls(liveRequest);
            capture.setRepeatingRequest(liveRequest.build(),liveCallback,worker);
            publish(state,lastMessage);
            return true;
        } catch(Exception error) {
            requestedZoom=previousZoom;requestedExposure=previousEv;
            try {setRequestControls(liveRequest);}catch(Exception ignored){}
            publish(state,"Не удалось применить увеличение или экспозицию: "+error.getMessage());
            return false;
        }
    }
    public static boolean updateTorch(boolean enabled,
        java.util.function.Consumer<Boolean> completed) {
        synchronized(STATE_LOCK) {
            NativeCaptureService owner=runningInstance;
            if(owner==null || owner.worker==null || !owner.torchAvailable ||
               !( "previewing".equals(state) || "recording".equals(state) ||
                  "paused".equals(state)))return false;
            return owner.worker.post(()->completed.accept(owner.applyTorch(enabled)));
        }
    }
    private boolean applyTorch(boolean enabled) {
        if(liveRequest==null||capture==null||camera==null||stopRequested)return false;
        boolean old=torchEnabled;
        torchEnabled=enabled;
        try {
            setRequestControls(liveRequest);
            capture.setRepeatingRequest(liveRequest.build(),liveCallback,worker);
            publish(state,lastMessage);
            return true;
        }catch(Exception error){
            torchEnabled=old;
            try{setRequestControls(liveRequest);}catch(Exception ignored){}
            publish(state,"Невозможно включить фонарик: "+error.getMessage());
            return false;
        }
    }
    public static boolean setFocus(boolean manual,float diopters,
        java.util.function.Consumer<Boolean> completed) {
        synchronized(STATE_LOCK){
            NativeCaptureService owner=runningInstance;
            if(owner==null||owner.worker==null||
              !("previewing".equals(state)||"recording".equals(state)||"paused".equals(state)))
                return false;
            if(manual && (!owner.manualFocusSupported || !Float.isFinite(diopters) ||
                diopters<0f || diopters>owner.maxFocusDiopters))return false;
            if(!manual && !owner.autoFocusSupported)return false;
            return owner.worker.post(()->completed.accept(owner.applyFocus(manual,diopters)));
        }
    }
    private boolean applyFocus(boolean manual,float diopters){
        if(liveRequest==null||capture==null||camera==null||stopRequested)return false;
        boolean previousMode=manualFocus;
        float previousDistance=requestedFocusDiopters;
        manualFocus=manual;
        if(manual)requestedFocusDiopters=diopters;
        try {
            setRequestControls(liveRequest);
            capture.setRepeatingRequest(liveRequest.build(),liveCallback,worker);
            // CONTROL_AF_MODE_AUTO requires a one-shot START trigger;
            // continuous AF modes must NOT be retriggered for every frame.
            if(!manual && automaticAfMode==CaptureRequest.CONTROL_AF_MODE_AUTO) {
                liveRequest.set(CaptureRequest.CONTROL_AF_TRIGGER,
                    CaptureRequest.CONTROL_AF_TRIGGER_START);
                capture.capture(liveRequest.build(),liveCallback,worker);
                liveRequest.set(CaptureRequest.CONTROL_AF_TRIGGER,
                    CaptureRequest.CONTROL_AF_TRIGGER_IDLE);
                capture.setRepeatingRequest(liveRequest.build(),liveCallback,worker);
            }
            publish(state,lastMessage);
            return true;
        }catch(Exception error){
            manualFocus=previousMode;requestedFocusDiopters=previousDistance;
            try{setRequestControls(liveRequest);}catch(Exception ignored){}
            publish(state,"Не удалось установить фокус: "+error.getMessage());
            return false;
        }
    }
    private CameraCaptureSession.CaptureCallback captureFeedback(){
        return new CameraCaptureSession.CaptureCallback(){
            @Override public void onCaptureCompleted(CameraCaptureSession session,
                CaptureRequest request,TotalCaptureResult result){
                Float focus=result.get(CaptureResult.LENS_FOCUS_DISTANCE);
                Integer af=result.get(CaptureResult.CONTROL_AF_STATE);
                if(focus!=null)reportedFocusDiopters=focus;
                if(af!=null)reportedAfState=af;
                if(stabilizationResultSeen)return;
                Integer eis=result.get(CaptureResult.CONTROL_VIDEO_STABILIZATION_MODE);
                Integer ois=result.get(CaptureResult.LENS_OPTICAL_STABILIZATION_MODE);
                if(eis!=null||ois!=null){
                    stabilizationResultSeen=true;
                    chosenStabilization=eis!=null &&
                        eis==CaptureResult.CONTROL_VIDEO_STABILIZATION_MODE_ON
                        ? "EIS CaptureResult ON" :
                        ois!=null && ois==CaptureResult.LENS_OPTICAL_STABILIZATION_MODE_ON
                        ? "OIS CaptureResult ON":"CaptureResult stabilization OFF";
                    publish(state,lastMessage);
                }
            }
        };
    }
    public static boolean tapToMeter(float x,float y,
        java.util.function.Consumer<Boolean> completed) {
        synchronized(STATE_LOCK){
            NativeCaptureService owner=runningInstance;
            if(owner==null||owner.worker==null||
              !("previewing".equals(state)||"recording".equals(state)||"paused".equals(state)))
                return false;
            if(!Float.isFinite(x)||!Float.isFinite(y)||x<0f||x>1f||y<0f||y>1f
                ||owner.previewReader==null||
                !(owner.maxAfRegions>0&&owner.autoFocusSupported ||
                  owner.maxAeRegions>0))return false;
            return owner.worker.post(()->completed.accept(owner.applyTapToMeter(x,y)));
        }
    }
    private boolean applyTapToMeter(float x,float y){
        if(liveRequest==null||capture==null||camera==null||stopRequested||
           previewReader==null)return false;
        float oldX=focusTapX,oldY=focusTapY;
        boolean wasManual=manualFocus, oldAf=focusTapAf,oldAe=focusTapAe;
        focusTapX=x;focusTapY=y;
        focusTapAf=maxAfRegions>0 && autoFocusSupported;
        focusTapAe=maxAeRegions>0;
        if(focusTapAf)manualFocus=false; // explicit user tap switches manual to autofocus
        focusTapSubmitted=false;
        try{
            setRequestControls(liveRequest);
            capture.setRepeatingRequest(liveRequest.build(),liveCallback,worker);
            if(focusTapAf){
                liveRequest.set(CaptureRequest.CONTROL_AF_TRIGGER,
                    CaptureRequest.CONTROL_AF_TRIGGER_START);
                capture.capture(liveRequest.build(),liveCallback,worker);
                liveRequest.set(CaptureRequest.CONTROL_AF_TRIGGER,
                    CaptureRequest.CONTROL_AF_TRIGGER_IDLE);
                capture.setRepeatingRequest(liveRequest.build(),liveCallback,worker);
            }
            focusTapSubmitted=true; // Camera2 accepted command, focus outcome still unknown
            publish(state,lastMessage);
            return true;
        }catch(Exception error){
            focusTapX=oldX;focusTapY=oldY;manualFocus=wasManual;
            focusTapAf=oldAf;focusTapAe=oldAe;
            try{
                liveRequest.set(CaptureRequest.CONTROL_AF_TRIGGER,
                    CaptureRequest.CONTROL_AF_TRIGGER_IDLE);
                setRequestControls(liveRequest);
                capture.setRepeatingRequest(liveRequest.build(),liveCallback,worker);
            }catch(Exception ignored){}
            publish(state,"Фокус/экспозамер по касанию не применён: "+error.getMessage());
            return false;
        }
    }
    public static boolean isRunning() {
        synchronized (STATE_LOCK) {
            return runningInstance != null &&
              ("starting".equals(state) || "previewing".equals(state) || "recording".equals(state) || "paused".equals(state) || "stopping".equals(state));
        }
    }
    public static com.getcapacitor.JSObject status(Context context) {
        com.getcapacitor.JSObject out = new com.getcapacitor.JSObject();
        synchronized (STATE_LOCK) {
            String value = state;
            String message = lastMessage;
            String path = savedPath;
            String uri = savedUri;
            String stab = chosenStabilization;
            boolean observed = stabilizationResultSeen;
            long started = recordingStartedAt;
            long pausedAt = pausedAtMs, excluded = totalPausedMs, finished = finishedDurationMs;
            String chosenCamera = selectedCameraId;
            int width = selectedWidth, height = selectedHeight, fps = selectedFps;
            if (runningInstance == null) {
                android.content.SharedPreferences preferences =
                    context.getSharedPreferences(STORE, MODE_PRIVATE);
                value = preferences.getString("state", "idle");
                message = preferences.getString("message", "Нет записи");
                path = preferences.getString("path", "");
                uri = preferences.getString("uri", "");
                stab = preferences.getString("stabilization", "unknown");
                observed = preferences.getBoolean("stabilizationObserved", false);
                started = preferences.getLong("started", 0L);
                pausedAt = preferences.getLong("pausedAt", 0L);
                excluded = preferences.getLong("totalPaused", 0L);
                finished = preferences.getLong("finishedDuration", 0L);
                chosenCamera = preferences.getString("cameraId", "");
                width = preferences.getInt("width", 0);
                height = preferences.getInt("height", 0);
                fps = preferences.getInt("fps", 0);
                // A process killed mid-recording cannot reattach an old MediaRecorder.
                if ("recording".equals(value) || "paused".equals(value) || "starting".equals(value)
                    || "stopping".equals(value)) {
                    value = "interrupted";
                    message = "Android завершил процесс записи. Целостность файла не подтверждена.";
                }
            }
            if (runningInstance == null && "previewing".equals(value)) {
                value = "idle";
                message = "Предпросмотр остановлен при закрытии Android-процесса";
            }
            out.put("directPreviewActive", runningInstance != null &&
                directPreviewActive && "previewing".equals(value));
            out.put("state", value);
            out.put("message", message);
            out.put("startedAt", started);
            out.put("cameraId", chosenCamera);
            out.put("width", width);
            out.put("height", height);
            out.put("fps", fps);
            long end = "recording".equals(value) ? System.currentTimeMillis() :
                "paused".equals(value) ? pausedAt : started + finished + excluded;
            long elapsed = started > 0 ? Math.max(0L, end - started - excluded) : 0L;
            out.put("recordedDurationMs", "recording".equals(value) || "paused".equals(value)
                ? elapsed : finished);
            out.put("tapAfSupported",runningInstance!=null && runningInstance.maxAfRegions>0 &&
                runningInstance.autoFocusSupported);
            out.put("tapAeSupported",runningInstance!=null && runningInstance.maxAeRegions>0);
            out.put("tapX",runningInstance==null || !Float.isFinite(runningInstance.focusTapX)
                ? -1f:runningInstance.focusTapX);
            out.put("tapY",runningInstance==null || !Float.isFinite(runningInstance.focusTapY)
                ? -1f:runningInstance.focusTapY);
            out.put("tapSubmitted",runningInstance!=null && runningInstance.focusTapSubmitted);
            out.put("manualFocusSupported",runningInstance!=null && runningInstance.manualFocusSupported);
            out.put("autoFocusSupported",runningInstance!=null && runningInstance.autoFocusSupported);
            out.put("focusMode",runningInstance!=null && runningInstance.manualFocus?"manual":"auto");
            out.put("focusDiopters",runningInstance==null?0f:runningInstance.requestedFocusDiopters);
            out.put("maxFocusDiopters",runningInstance==null?0f:runningInstance.maxFocusDiopters);
            out.put("reportedFocusDiopters",runningInstance==null?-1f:runningInstance.reportedFocusDiopters);
            out.put("reportedAfState",runningInstance==null?-1:runningInstance.reportedAfState);
            out.put("torchAvailable",runningInstance != null && runningInstance.torchAvailable);
            out.put("torchEnabled",runningInstance != null && runningInstance.torchEnabled);
            out.put("zoom",runningInstance == null?1f:runningInstance.requestedZoom);
            out.put("maxZoom",runningInstance == null?1f:runningInstance.maxDigitalZoom);
            out.put("exposureIndex",runningInstance == null?0:runningInstance.requestedExposure);
            out.put("exposureMin",runningInstance == null?0:runningInstance.exposureRange.getLower());
            out.put("exposureMax",runningInstance == null?0:runningInstance.exposureRange.getUpper());
            out.put("exposureStep",runningInstance == null?0f:runningInstance.exposureStep);
            out.put("orientationDegrees", runningInstance == null
                ? context.getSharedPreferences(STORE, MODE_PRIVATE).getInt("orientation", -1)
                : recordedOrientation);
            out.put("stabilization", stab);
            out.put("stabilizationCaptureResultObserved", observed);
            out.put("savedBytes", !path.isEmpty() && new File(path).isFile()
                ? new File(path).length() : 0L);
            out.put("savedUri", uri);
            android.content.SharedPreferences previous =
                context.getSharedPreferences(STORE, MODE_PRIVATE);
            out.put("audioRequested", runningInstance == null
                ? previous.getBoolean("recordAudio", false) : runningInstance.wantAudio);
            out.put("mp4TracksInspected", runningInstance == null
                ? previous.getBoolean("mp4TracksInspected", false) : mp4TracksInspected);
            out.put("mp4HasVideoTrack", runningInstance == null
                ? previous.getBoolean("mp4HasVideoTrack", false) : mp4HasVideoTrack);
            out.put("mp4HasAudioTrack", runningInstance == null
                ? previous.getBoolean("mp4HasAudioTrack", false) : mp4HasAudioTrack);
            out.put("mp4VideoWidth", runningInstance == null
                ? previous.getInt("mp4VideoWidth", 0) : mp4VideoWidth);
            out.put("mp4VideoHeight", runningInstance == null
                ? previous.getInt("mp4VideoHeight", 0) : mp4VideoHeight);
            out.put("mp4VideoSamples", runningInstance == null
                ? previous.getInt("mp4VideoSamples", 0) : mp4VideoSamples);
            out.put("mp4AudioSamples", runningInstance == null
                ? previous.getInt("mp4AudioSamples", 0) : mp4AudioSamples);
            out.put("mp4VideoTimestampRollbacks", runningInstance == null
                ? previous.getInt("mp4VideoTimestampRollbacks", 0) : mp4VideoTimestampRollbacks);
            out.put("mp4VideoTimestampDuplicates", runningInstance == null
                ? previous.getInt("mp4VideoTimestampDuplicates", 0) : mp4VideoTimestampDuplicates);
            out.put("mp4VideoSampleLimitReached", runningInstance == null
                ? previous.getBoolean("mp4VideoSampleLimitReached", false) : mp4VideoSampleLimitReached);
            out.put("mp4SampledFps", runningInstance == null
                ? previous.getFloat("mp4SampledFps", -1f) : mp4SampledFps);
            out.put("mp4DurationMs", runningInstance == null
                ? previous.getLong("mp4DurationMs", -1L) : mp4DurationMs);
            out.put("mp4TailVideoSamples", runningInstance == null
                ? previous.getInt("mp4TailVideoSamples", 0) : mp4TailVideoSamples);
            out.put("mp4TailSampledFps", runningInstance == null
                ? previous.getFloat("mp4TailSampledFps", -1f) : mp4TailSampledFps);
            out.put("mp4TailNearEnd", runningInstance == null
                ? previous.getBoolean("mp4TailNearEnd", false) : mp4TailNearEnd);
            out.put("videoOnly", !(runningInstance == null
                ? previous.getBoolean("recordAudio", false) : runningInstance.wantAudio));
        }
        return out;
    }
    private void publish(String newState, String message) {
        synchronized (STATE_LOCK) {
            state = newState;
            lastMessage = message;
            getSharedPreferences(STORE, MODE_PRIVATE).edit()
                .putString("state", newState).putString("message", message)
                .putString("path", savedPath).putString("uri", savedUri)
                .putString("stabilization", chosenStabilization)
                .putBoolean("stabilizationObserved", stabilizationResultSeen)
                .putLong("started", recordingStartedAt)
                .putString("cameraId", selectedCameraId)
                .putInt("width", selectedWidth)
                .putInt("height", selectedHeight)
                .putInt("fps", selectedFps)
                .putLong("pausedAt", pausedAtMs)
                .putLong("totalPaused", totalPausedMs)
                .putLong("finishedDuration", finishedDurationMs)
                .putInt("orientation", recordedOrientation)
                .putBoolean("recordAudio", wantAudio)
                .putBoolean("mp4TracksInspected", mp4TracksInspected)
                .putBoolean("mp4HasVideoTrack", mp4HasVideoTrack)
                .putBoolean("mp4HasAudioTrack", mp4HasAudioTrack)
                .putInt("mp4VideoWidth", mp4VideoWidth)
                .putInt("mp4VideoHeight", mp4VideoHeight)
                .putInt("mp4VideoSamples", mp4VideoSamples)
                .putInt("mp4AudioSamples", mp4AudioSamples)
                .putInt("mp4VideoTimestampRollbacks", mp4VideoTimestampRollbacks)
                .putInt("mp4VideoTimestampDuplicates", mp4VideoTimestampDuplicates)
                .putBoolean("mp4VideoSampleLimitReached", mp4VideoSampleLimitReached)
                .putFloat("mp4SampledFps", mp4SampledFps)
                .putLong("mp4DurationMs", mp4DurationMs)
                .putInt("mp4TailVideoSamples", mp4TailVideoSamples)
                .putFloat("mp4TailSampledFps", mp4TailSampledFps)
                .putBoolean("mp4TailNearEnd", mp4TailNearEnd).apply();
        }
    }
    @Override public void onCreate() {
        super.onCreate();
        workerThread = new HandlerThread("Native-Camera2-Record");
        workerThread.start();
        worker = new Handler(workerThread.getLooper());
        previewThread = new HandlerThread("Native-Camera2-JPEG-Preview");
        previewThread.start();
        previewHandler = new Handler(previewThread.getLooper());
        synchronized (STATE_LOCK) {
            runningInstance = this;
            previewConsumerVisible = previewOwnerId != null;
        }
        NotificationManager notifications =
            (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) notifications.createNotificationChannel(
            new NotificationChannel(CHANNEL, "Нативная видеозапись",
                NotificationManager.IMPORTANCE_LOW));
    }
    private Notification notification() {
        Intent stopIntent = new Intent(this, NativeCaptureService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPending = PendingIntent.getService(this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("MULTI-CAM POV · нативная запись")
            .setContentText("Съёмка выполняется Android Camera2")
            .setOngoing(true)
            .addAction(android.R.drawable.ic_media_pause, "Завершить запись", stopPending)
            .build();
    }
    private void pauseRecording() {
        if (!encoderStarted || encoderPaused || stopRequested || !"recording".equals(state)) return;
        try {
            encoder.pause();
            encoderPaused = true;
            pausedAtMs = System.currentTimeMillis();
            publish("paused", "Нативная запись на паузе, Camera2 остаётся открытой");
        } catch (RuntimeException error) {
            publish("recording", "Пауза не поддерживается кодировщиком: " + error.getMessage());
        }
    }
    private void resumeRecording() {
        if (!encoderStarted || !encoderPaused || stopRequested || !"paused".equals(state)) return;
        try {
            encoder.resume();
            totalPausedMs += Math.max(0L, System.currentTimeMillis() - pausedAtMs);
            pausedAtMs = 0L;
            encoderPaused = false;
            publish("recording", "Нативная запись возобновлена в тот же MP4");
        } catch (RuntimeException error) {
            publish("paused", "Не удалось возобновить запись: " + error.getMessage());
        }
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopRequested = true;
            if (worker != null) worker.post(this::finish);
            return START_NOT_STICKY;
        }
        if (intent != null && (ACTION_PAUSE.equals(intent.getAction()) ||
            ACTION_RESUME.equals(intent.getAction()))) {
            if (worker != null) worker.post(ACTION_PAUSE.equals(intent.getAction())
                ? this::pauseRecording : this::resumeRecording);
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_PREVIEW.equals(intent.getAction())) {
            startPreview(intent);
            return START_NOT_STICKY;
        }
        if (intent == null || !ACTION_START.equals(intent.getAction())) {
            stopSelf(); return START_NOT_STICKY;
        }
        final boolean handoff = "previewing".equals(state) && camera != null;
        if ((!handoff && camera != null) || encoder != null || "starting".equals(state) ||
            "recording".equals(state) || "paused".equals(state) ||
            "stopping".equals(state)) return START_NOT_STICKY;
        wantAudio = intent.getBooleanExtra("audio", false);
        int type = ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
        if (wantAudio) type |= ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION,
                notification(), type);
            else startForeground(NOTIFICATION, notification());
        } catch (RuntimeException error) {
            publish("error", "Android отказал в запуске службы камеры: " + error.getMessage());
            stopSelf(); return START_NOT_STICKY;
        }
        stopRequested = false;
        interruptedByCamera = false;
        synchronized (STATE_LOCK) {
            savedPath = ""; savedUri = ""; chosenStabilization = "unknown";
            stabilizationResultSeen = false; recordingStartedAt = 0L;
            recordedOrientation = -1;
            pausedAtMs = 0L; totalPausedMs = 0L; finishedDurationMs = 0L;
            mp4TracksInspected = false; mp4HasVideoTrack = false;
            mp4HasAudioTrack = false; mp4VideoWidth = 0; mp4VideoHeight = 0;
            mp4VideoSamples = 0; mp4AudioSamples = 0;
            mp4VideoTimestampRollbacks = 0; mp4VideoTimestampDuplicates = 0;
            mp4VideoSampleLimitReached = false; mp4SampledFps = -1f;
            mp4DurationMs = -1L; mp4TailVideoSamples = 0;
            mp4TailSampledFps = -1f; mp4TailNearEnd = false;
        }
        final int session = ++generation;
        final String id = intent.getStringExtra("cameraId");
        final int width = intent.getIntExtra("width", 1920);
        final int height = intent.getIntExtra("height", 1080);
        final int fps = intent.getIntExtra("fps", 30);
        selectedCameraId = id == null ? "" : id;
        selectedWidth = width; selectedHeight = height; selectedFps = fps;
        publish("starting", "Открываю Camera2 и кодировщик");
        // Camera2 OEM drivers may never invoke the open callback. Stop a hung
        // foreground session instead of leaving the camera busy indefinitely.
        openingTimeout = () -> {
            if (session == generation && !encoderStarted && !stopRequested)
                fail(new IllegalStateException("Истекло время открытия Camera2"));
        };
        worker.postDelayed(openingTimeout, 12000L);
        worker.post(() -> {
            if (handoff) releaseCamera();
            if (session == generation && !stopRequested) open(session, id, width, height, fps);
        });
        return START_NOT_STICKY;
    }
    private void startPreview(Intent intent) {
        if (camera != null || encoder != null || isRecordingState()) return;
        final String id = intent.getStringExtra("cameraId");
        if (id == null || id.isEmpty() ||
            checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            publish("error","Разрешение на камеру или объектив недоступны"); stopSelf(); return;
        }
        try {
            if (Build.VERSION.SDK_INT >= 29)
                startForeground(NOTIFICATION,notification(),ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA);
            else startForeground(NOTIFICATION,notification());
        } catch(RuntimeException error) {
            publish("error","Android запретил предпросмотр: "+error.getMessage());stopSelf();return;
        }
        stopRequested=false;
        int token=++generation;
        selectedCameraId=id;
        publish("starting","Открываю нативный предпросмотр");
        openingTimeout=()->{
            if(token==generation && !"previewing".equals(state) && !stopRequested)
                fail(new IllegalStateException("Тайм-аут предпросмотра Camera2"));
        };
        worker.postDelayed(openingTimeout,12000);
        worker.post(()->{
            try {
                CameraManager manager=(CameraManager)getSystemService(Context.CAMERA_SERVICE);
                CameraCharacteristics characteristics=manager.getCameraCharacteristics(id);
                configureControlLimits(characteristics);
                StreamConfigurationMap config=characteristics.get(
                    CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
                manager.openCamera(id,new CameraDevice.StateCallback(){
                    @Override public void onOpened(CameraDevice opened){
                        if(token!=generation || stopRequested){opened.close();return;}
                        camera=opened;
                        try {configurePreviewOnlySession(opened,token,config,true);}
                        catch(Exception error){fail(error);}
                    }
                    @Override public void onDisconnected(CameraDevice disconnected){
                        disconnected.close();
                        if(token!=generation)return;
                        if(camera==disconnected)camera=null;
                        fail(new IllegalStateException("Камера предпросмотра отключилась"));
                    }
                    @Override public void onError(CameraDevice broken,int code){
                        broken.close();
                        if(token!=generation)return;
                        if(camera==broken)camera=null;
                        fail(new IllegalStateException("Ошибка предпросмотра Camera2 "+code));
                    }
                },worker);
            }catch(Exception error){fail(error);}
        });
    }
    private void configurePreviewOnlySession(CameraDevice opened, int token,
        StreamConfigurationMap config, boolean tryDirect) throws Exception {
        Surface target = null;
        boolean usingDirect = false;
        SurfaceTexture texture = null;
        synchronized (STATE_LOCK) {
            if (tryDirect && directPreviewOwnerId != null)
                texture = directPreviewTexture;
        }
        if (texture != null && config != null) {
            try {
                Size[] sizes = config.getOutputSizes(SurfaceTexture.class);
                Size selected = null;
                if (sizes != null) for (Size candidate : sizes) {
                    if (candidate.getWidth() < 320 || candidate.getHeight() < 240 ||
                        candidate.getWidth() > 1920 || candidate.getHeight() > 1080) continue;
                    if (selected == null || candidate.getWidth() * candidate.getHeight() >
                        selected.getWidth() * selected.getHeight()) selected = candidate;
                }
                if (selected != null) {
                    texture.setDefaultBufferSize(selected.getWidth(),selected.getHeight());
                    Surface surface = new Surface(texture);
                    if (surface.isValid()) {
                        activeDirectPreviewSurface = surface;
                        target = surface;
                        usingDirect = true;
                    } else surface.release();
                }
            } catch(Exception ignored) {
                if (activeDirectPreviewSurface != null) {
                    try {activeDirectPreviewSurface.release();}catch(Exception ignoredAgain){}
                    activeDirectPreviewSurface = null;
                }
            }
        }
        if (target == null) {
            Size[] sizes = config == null ? null :
                config.getOutputSizes(ImageFormat.YUV_420_888);
            Size best = null;
            if (sizes != null) for (Size candidate : sizes)
                if (candidate.getWidth() >= 160 && candidate.getHeight() >= 120 &&
                    candidate.getWidth() <= 640 && candidate.getHeight() <= 480 &&
                    candidate.getWidth() % 2 == 0 && candidate.getHeight() % 2 == 0 &&
                    (best == null || candidate.getWidth() * candidate.getHeight() >
                        best.getWidth() * best.getHeight())) best = candidate;
            if (best == null)
                throw new IllegalStateException("Нативный предпросмотр не поддерживается");
            previewReader = ImageReader.newInstance(best.getWidth(),best.getHeight(),
                ImageFormat.YUV_420_888,2);
            previewReader.setOnImageAvailableListener(this::onPreviewImage,previewHandler);
            target = previewReader.getSurface();
        }
        final Surface output = target;
        final boolean direct = usingDirect;
        CaptureRequest.Builder request=opened.createCaptureRequest(
            CameraDevice.TEMPLATE_PREVIEW);
        request.addTarget(output);
        setRequestControls(request);
        liveRequest=request;
        liveCallback=captureFeedback();
        opened.createCaptureSession(Arrays.asList(output),
            new CameraCaptureSession.StateCallback(){
                @Override public void onConfigured(CameraCaptureSession ready){
                    if(token!=generation || stopRequested){ready.close();return;}
                    capture=ready;
                    try {
                        capture.setRepeatingRequest(request.build(),liveCallback,worker);
                        directPreviewActive=direct;
                        if(openingTimeout!=null){
                            worker.removeCallbacks(openingTimeout);openingTimeout=null;
                        }
                        publish("previewing",direct?
                            "Прямой Camera2 TextureView предпросмотр активен; FPS на устройстве не измерен":
                            "JPEG предпросмотр готов; запись MP4 доступна");
                    }catch(Exception error){fail(error);}
                }
                @Override public void onConfigureFailed(CameraCaptureSession broken){
                    broken.close();
                    if (direct && token==generation && !stopRequested) {
                        // OEM camera may reject TextureView output. Retry the
                        // legacy YUV path without creating a second camera.
                        directPreviewActive=false;
                        if(activeDirectPreviewSurface!=null){
                            try{activeDirectPreviewSurface.release();}catch(Exception ignored){}
                            activeDirectPreviewSurface=null;
                        }
                        try{configurePreviewOnlySession(opened,token,config,false);}
                        catch(Exception error){fail(error);}
                    } else fail(new IllegalStateException("Сессия предпросмотра не поддерживается"));
                }
            },worker);
    }
    private boolean isRecordingState() {
        return "recording".equals(state) || "paused".equals(state) || "stopping".equals(state);
    }
    private void open(int session, String id, int width, int height, int fps) {
        try {
            if (stopRequested || session != generation) { finish(); return; }
            if (id == null || id.isEmpty() || width < 160 || height < 120 ||
                width > 3840 || height > 2160 || fps < 15 || fps > 60)
                throw new IllegalArgumentException("Недопустимый режим Native Camera2");
            if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                throw new SecurityException("Разрешение камеры отсутствует");
            if (wantAudio && checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED)
                throw new SecurityException("Разрешение микрофона отсутствует");
            CameraManager manager = (CameraManager)getSystemService(Context.CAMERA_SERVICE);
            CameraCharacteristics info = manager.getCameraCharacteristics(id);
            configureControlLimits(info);
            StreamConfigurationMap map =
                info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            boolean supported = false;
            if (map != null && map.getOutputSizes(MediaRecorder.class) != null)
                for (Size size : map.getOutputSizes(MediaRecorder.class))
                    if (size.getWidth() == width && size.getHeight() == height)
                        supported = true;
            if (!supported) throw new IllegalArgumentException("Камера не поддерживает это разрешение");
            // A reported MediaRecorder resolution and a separate AE FPS range
            // do NOT prove that this exact sensor output can reach that FPS.
            // Reject combinations contradicted by the advertised minimum frame duration.
            // This is a conservative preflight; final MP4 still needs verification.
            try {
                long minimumNs = map.getOutputMinFrameDuration(MediaRecorder.class,
                    new Size(width, height));
                if (minimumNs > 0L && (double) minimumNs * fps > 1_020_000_000.0)
                    throw new IllegalArgumentException("Выбранный FPS превышает скорость сенсора для "
                        + width + "×" + height + "; требуется другой режим");
            } catch (IllegalArgumentException error) {
                if (error.getMessage() != null &&
                    error.getMessage().startsWith("Выбранный FPS")) throw error;
                // OEM may omit the optional duration: leave availability unknown.
            }
            Range<Integer>[] ranges = info.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
            Range<Integer> selected = null;
            if (ranges != null) for (Range<Integer> range : ranges)
                if (range.contains(fps) && (selected == null ||
                    range.getUpper() - range.getLower() <
                    selected.getUpper() - selected.getLower())) selected = range;
            if (selected == null) throw new IllegalArgumentException("Камера не сообщает поддержку выбранного FPS");
            final Range<Integer> fpsRange = selected;

            File directory = new File(getFilesDir(), "native-video");
            if (!directory.exists() && !directory.mkdirs())
                throw new IllegalStateException("Нет места для каталога видео");
            media = new File(directory, "native-" + System.currentTimeMillis() + ".mp4");
            encoder = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
            if (wantAudio) encoder.setAudioSource(MediaRecorder.AudioSource.MIC);
            encoder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
            encoder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            encoder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
            if (wantAudio) {
                encoder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
                encoder.setAudioEncodingBitRate(128000);
                encoder.setAudioSamplingRate(44100);
            }
            // The orientation hint is frozen at the beginning of each MP4;
            // later Activity rotation or fold geometry never rewrites frames.
            Integer sensor = info.get(CameraCharacteristics.SENSOR_ORIENTATION);
            int sensorDegrees = sensor == null ? 0 : sensor;
            WindowManager window = (WindowManager)getSystemService(Context.WINDOW_SERVICE);
            int rotation = window == null ? Surface.ROTATION_0 : window.getDefaultDisplay().getRotation();
            int screenDegrees = rotation == Surface.ROTATION_90 ? 90 :
                rotation == Surface.ROTATION_180 ? 180 :
                rotation == Surface.ROTATION_270 ? 270 : 0;
            Integer lens = info.get(CameraCharacteristics.LENS_FACING);
            boolean front = lens != null && lens == CameraCharacteristics.LENS_FACING_FRONT;
            int orientation = ((front ? sensorDegrees + screenDegrees :
                sensorDegrees - screenDegrees) % 360 + 360) % 360;
            if (orientation % 90 == 0) {
                encoder.setOrientationHint(orientation);
                recordedOrientation = orientation;
            }
            encoder.setVideoSize(width,height);
            encoder.setVideoFrameRate(fps);
            encoder.setVideoEncodingBitRate((int)Math.min(16000000L, Math.max(1500000L,
                (long)width * (long)height * (long)fps / 9L)));
            encoder.setOutputFile(media.getAbsolutePath());
            encoder.prepare();
            final Surface surface = encoder.getSurface();
            final ArrayList<Surface> outputs = new ArrayList<>();
            outputs.add(surface);
            try {
                Size[] choices = map == null ? null : map.getOutputSizes(ImageFormat.YUV_420_888);
                Size small = null;
                if (choices != null) for (Size candidate : choices)
                    if (candidate.getWidth() >= 160 && candidate.getHeight() >= 120 &&
                        candidate.getWidth() <= 640 && candidate.getHeight() <= 480 &&
                        candidate.getWidth() % 2 == 0 && candidate.getHeight() % 2 == 0 &&
                        (small == null || candidate.getWidth()*candidate.getHeight() >
                         small.getWidth()*small.getHeight())) small = candidate;
                if (small != null) {
                    previewReader = ImageReader.newInstance(small.getWidth(),small.getHeight(),
                        ImageFormat.YUV_420_888,2);
                    previewReader.setOnImageAvailableListener(this::onPreviewImage,previewHandler);
                    outputs.add(previewReader.getSurface());
                }
            } catch(Exception ignored) {
                if(previewReader!=null){previewReader.close();previewReader=null;}
            }
            manager.openCamera(id, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice opened) {
                    if (session != generation || stopRequested) {
                        opened.close();
                        if (stopRequested && session == generation) finish();
                        return;
                    }
                    camera = opened;
                    try {
                        CaptureRequest.Builder request = opened.createCaptureRequest(
                            CameraDevice.TEMPLATE_RECORD);
                        request.addTarget(surface);
                        if(previewReader!=null)request.addTarget(previewReader.getSurface());
                        request.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, fpsRange);
                        setRequestControls(request);
                        liveRequest=request;

                        // Apply EIS OR OIS to the actual recorded Camera2 session
                        // when declared for this camera. CaptureResult confirms.
                        int[] eis = info.get(
                            CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES);
                        int[] ois = info.get(
                            CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION);
                        boolean eisAvailable = false, oisAvailable = false;
                        if (eis != null) for (int v : eis)
                            if (v == CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON)
                                eisAvailable = true;
                        if (ois != null) for (int v : ois)
                            if (v == CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON)
                                oisAvailable = true;
                        if (eisAvailable) {
                            request.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                                CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON);
                            if (oisAvailable) request.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                                CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_OFF);
                            chosenStabilization = "EIS requested";
                        } else if (oisAvailable) {
                            request.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                                CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON);
                            chosenStabilization = "OIS requested";
                        } else chosenStabilization = "not declared for selected Camera2 mode";
                        final boolean useEis=eisAvailable, useOis=oisAvailable;
                        opened.createCaptureSession(outputs,
                            new CameraCaptureSession.StateCallback() {
                                @Override public void onConfigured(CameraCaptureSession sessionHandle) {
                                    if (session != generation || stopRequested) {
                                        sessionHandle.close(); finish(); return;
                                    }
                                    capture = sessionHandle;
                                    try {
                                        liveCallback=captureFeedback();
                                        capture.setRepeatingRequest(request.build(),liveCallback,worker);
                                        if (openingTimeout != null) {
                                            worker.removeCallbacks(openingTimeout);
                                            openingTimeout = null;
                                        }
                                        encoder.start();
                                        encoderStarted = true;
                                        encoderPaused = false;
                                        recordingStartedAt = System.currentTimeMillis();
                                        publish("recording",
                                            "Нативная Camera2 запись запущена. Контроль через уведомление.");
                                    } catch(Exception error) { fail(error); }
                                }
                                @Override public void onConfigureFailed(CameraCaptureSession sessionHandle) {
                                    sessionHandle.close();
                                    if (previewReader == null) {
                                        fail(new IllegalStateException("Camera2 capture session failed"));
                                        return;
                                    }
                                    // Recording has priority over optional preview. Some
                                    // OEM combinations do not permit a parallel YUV stream.
                                    previewReader.close(); previewReader=null;
                                    try {
                                        CaptureRequest.Builder only=opened.createCaptureRequest(
                                            CameraDevice.TEMPLATE_RECORD);
                                        only.addTarget(surface);
                                        only.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,fpsRange);

                                        if (useEis) {
                                            only.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                                                CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON);
                                            if (useOis)only.set(
                                                CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                                                CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_OFF);
                                        } else if(useOis)only.set(
                                            CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                                            CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON);
                                        setRequestControls(only);
                                        liveRequest=only;
                                        liveCallback=captureFeedback();
                                        opened.createCaptureSession(Arrays.asList(surface),
                                            new CameraCaptureSession.StateCallback() {
                                                @Override public void onConfigured(CameraCaptureSession ready) {
                                                    capture=ready;
                                                    try {
                                                        capture.setRepeatingRequest(only.build(),liveCallback,worker);
                                                        if(openingTimeout!=null){
                                                            worker.removeCallbacks(openingTimeout);
                                                            openingTimeout=null;
                                                        }
                                                        encoder.start();encoderStarted=true;encoderPaused=false;
                                                        recordingStartedAt=System.currentTimeMillis();
                                                        publish("recording",
                                                            "MP4 записывается; параллельный предпросмотр камерой не поддержан");
                                                    } catch(Exception error){fail(error);}
                                                }
                                                @Override public void onConfigureFailed(CameraCaptureSession broken) {
                                                    broken.close();
                                                    fail(new IllegalStateException("Camera2 recording session failed"));
                                                }
                                            },worker);
                                    } catch(Exception error){fail(error);}
                                }
                            }, worker);
                    } catch(Exception error) { fail(error); }
                }
                @Override public void onDisconnected(CameraDevice disconnected) {
                    disconnected.close();
                    if (camera == disconnected) camera = null;
                    if (!stopRequested) { interruptedByCamera = true; stopRequested = true; worker.post(NativeCaptureService.this::finish); }
                }
                @Override public void onError(CameraDevice broken, int error) {
                    broken.close();
                    if (camera == broken) camera = null;
                    interruptedByCamera = true;
                    fail(new IllegalStateException("Camera2 error " + error));
                }
            }, worker);
        } catch (Exception error) { fail(error); }
    }
    private void fail(Exception error) {
        if (stopRequested) return;
        stopRequested = true;
        publish("error", "Нативная запись: " + error.getMessage());
        finish();
    }
    private void releaseCamera() {
        liveRequest=null;
        liveCallback=null;
        latestPreviewJpeg = null; latestPreviewAt = 0; lastPreviewAttemptAt = 0;
        directPreviewActive = false;
        if(activeDirectPreviewSurface!=null) {
            try {activeDirectPreviewSurface.release();}catch(Exception ignored){}
            activeDirectPreviewSurface=null;
        }
        if(previewReader!=null){try{previewReader.close();}catch(Exception ignored){}previewReader=null;}
        if (capture != null) {
            try { capture.stopRepeating();capture.abortCaptures(); } catch(Exception ignored) {}
            try { capture.close(); } catch(Exception ignored) {}
            capture = null;
        }
        if (camera != null) { try {camera.close();}catch(Exception ignored){}camera=null; }
    }
    private static final class Mp4TrackAudit {
        boolean video, audio;
        int width, height, videoSamples, audioSamples;
        int timestampRollbacks, timestampDuplicates;
        boolean sampleLimitReached;
        float sampledFps = -1f;
        long durationMs = -1L;
        int tailSamples;
        float tailSampledFps = -1f;
        boolean tailNearEnd;
    }
    private void scanMp4Track(MediaExtractor extractor, int track, boolean video,
        Mp4TrackAudit audit) {
        extractor.selectTrack(track);
        try {
            long first = -1L, last = -1L;
            int samples = 0;
            int rollbacks = 0, duplicates = 0;
            // Only a bounded prefix. Never claim whole-file integrity.
            while (samples < MP4_SCAN_SAMPLES_PER_TRACK) {
                long pts = extractor.getSampleTime();
                if (pts < 0L) break;
                if (last >= 0L) {
                    if (pts < last) rollbacks++;
                    if (pts == last) duplicates++;
                }
                if (first < 0L) first = pts;
                last = pts;
                samples++;
                if (!extractor.advance()) break;
            }
            if (video) {
                audit.videoSamples = samples;
                audit.timestampRollbacks = rollbacks;
                audit.timestampDuplicates = duplicates;
                audit.sampleLimitReached = samples == MP4_SCAN_SAMPLES_PER_TRACK
                    && extractor.getSampleTime() >= 0L;
                if (samples >= 3 && last > first && rollbacks == 0 && duplicates == 0)
                    audit.sampledFps = (float)((samples - 1) * 1000000.0 / (last - first));
            } else audit.audioSamples = samples;
        } finally {
            extractor.unselectTrack(track);
        }
    }

    /** A second bounded scan starts at the last few seconds of the video.
     * The extractor seeks to a preceding key frame, so the scanned range is
     * approximate. This cannot establish that all middle frames are intact.
     */
    private void scanMp4Tail(MediaExtractor extractor, int track, Mp4TrackAudit audit) {
        if (audit.durationMs <= 0L) return;
        extractor.selectTrack(track);
        try {
            long endUs = audit.durationMs * 1000L;
            extractor.seekTo(Math.max(0L, endUs - 3000000L),
                MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            long first = -1L, last = -1L;
            int samples = 0, rollbacks = 0, duplicates = 0;
            while (samples < MP4_SCAN_SAMPLES_PER_TRACK) {
                long pts = extractor.getSampleTime();
                if (pts < 0L) break;
                if (last >= 0L) {
                    if (pts < last) rollbacks++;
                    if (pts == last) duplicates++;
                }
                if (first < 0L) first = pts;
                last = pts;
                samples++;
                if (!extractor.advance()) break;
            }
            audit.tailSamples = samples;
            audit.timestampRollbacks += rollbacks;
            audit.timestampDuplicates += duplicates;
            if (samples >= 3 && last > first && rollbacks == 0 && duplicates == 0)
                audit.tailSampledFps = (float)((samples - 1) * 1000000.0 / (last - first));
            // A final sample may precede the nominal media duration by a
            // frame or an interleaving delay; never require exact equality.
            audit.tailNearEnd = last >= 0L && last <= endUs + 1000000L &&
                endUs - last <= 2000000L;
        } finally {
            extractor.unselectTrack(track);
        }
    }
    private long readMp4DurationMs(File file) {
        MediaMetadataRetriever retriever = new MediaMetadataRetriever();
        try {
            retriever.setDataSource(file.getAbsolutePath());
            String value = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            if (value == null) return -1L;
            long duration = Long.parseLong(value);
            return duration > 0L ? duration : -1L;
        } catch (Exception ignored) {
            return -1L;
        } finally {
            try { retriever.release(); } catch (Exception ignored) {}
        }
    }

    /** MediaExtractor reads the finalized MP4 track headers. This does NOT
     * prove every encoded frame, audio fidelity, or uninterrupted fold capture.
     * If the parser fails, keep the outcome UNKNOWN rather than say no audio.
     */
    private Mp4TrackAudit inspectMp4Tracks(File candidate) {
        if (candidate == null || !candidate.isFile() || candidate.length() < 1024)
            return null;
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(candidate.getAbsolutePath());
            Mp4TrackAudit result = new Mp4TrackAudit();
            result.durationMs = readMp4DurationMs(candidate);
            int videoTrack = -1, audioTrack = -1;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.containsKey(MediaFormat.KEY_MIME)
                    ? format.getString(MediaFormat.KEY_MIME) : null;
                if (mime == null) continue;
                if (mime.startsWith("video/")) {
                    result.video = true;
                    if (videoTrack < 0) videoTrack = i;
                    if (format.containsKey(MediaFormat.KEY_WIDTH))
                        result.width = format.getInteger(MediaFormat.KEY_WIDTH);
                    if (format.containsKey(MediaFormat.KEY_HEIGHT))
                        result.height = format.getInteger(MediaFormat.KEY_HEIGHT);
                } else if (mime.startsWith("audio/")) {
                    result.audio = true;
                    if (audioTrack < 0) audioTrack = i;
                }
            }
            if (videoTrack >= 0) {
                scanMp4Track(extractor, videoTrack, true, result);
                scanMp4Tail(extractor, videoTrack, result);
            }
            if (audioTrack >= 0) scanMp4Track(extractor, audioTrack, false, result);
            return result;
        } catch (Exception ignored) {
            return null;
        } finally {
            try { extractor.release(); } catch (Exception ignored) {}
        }
    }
    private boolean savedMp4HasVideo(File candidate) {
        if (candidate == null || !candidate.isFile() || candidate.length() < 1024) return false;
        MediaMetadataRetriever reader = new MediaMetadataRetriever();
        try {
            reader.setDataSource(candidate.getAbsolutePath());
            String width = reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH);
            String height = reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT);
            String duration = reader.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);
            return width != null && height != null && duration != null &&
                Integer.parseInt(width) > 0 && Integer.parseInt(height) > 0 &&
                Long.parseLong(duration) > 0;
        } catch (Exception ignored) { return false; }
        finally { try {reader.release();}catch(Exception ignored) {} }
    }
    private void finish() {
        if ("previewing".equals(state) && encoder == null) {
            generation++;
            if (openingTimeout != null) {worker.removeCallbacks(openingTimeout);openingTimeout=null;}
            releaseCamera();
            publish("idle", "Предпросмотр остановлен, MP4 не создавался");
            stopForeground(true);
            stopSelf();
            return;
        }
        if (encoder == null && camera == null) {
            generation++;
            if (openingTimeout != null) {worker.removeCallbacks(openingTimeout);openingTimeout=null;}
            releaseCamera();
            if ("starting".equals(state) || "previewing".equals(state))
                publish("idle","Открытие камеры остановлено без MP4");
            stopForeground(true);
            stopSelf();
            return;
        }
        generation++;
        if (openingTimeout != null) {
            worker.removeCallbacks(openingTimeout);
            openingTimeout = null;
        }
        boolean previouslyRecording = encoderStarted;
        long endedAt = encoderPaused ? pausedAtMs : System.currentTimeMillis();
        finishedDurationMs = recordingStartedAt > 0L
            ? Math.max(0L, endedAt - recordingStartedAt - totalPausedMs) : 0L;
        if (!"error".equals(state)) publish("stopping", "Закрываю и сохраняю MP4");
        releaseCamera();
        boolean valid = false;
        try {
            if (encoder != null && previouslyRecording) encoder.stop();
            valid = previouslyRecording && savedMp4HasVideo(media);
        } catch (RuntimeException exception) {
            publish("error", "Не удалось завершить нативный MP4: " + exception.getMessage());
        } finally {
            if (encoder != null) {
                try {encoder.reset();encoder.release();}catch(Exception ignored){}
                encoder = null;
            }
            encoderStarted = false;
            encoderPaused = false;
        }
        if (valid && media != null) {
            Mp4TrackAudit audit = inspectMp4Tracks(media);
            mp4TracksInspected = audit != null;
            mp4HasVideoTrack = audit != null && audit.video;
            mp4HasAudioTrack = audit != null && audit.audio;
            mp4VideoWidth = audit == null ? 0 : audit.width;
            mp4VideoHeight = audit == null ? 0 : audit.height;
            mp4VideoSamples = audit == null ? 0 : audit.videoSamples;
            mp4AudioSamples = audit == null ? 0 : audit.audioSamples;
            mp4VideoTimestampRollbacks = audit == null ? 0 : audit.timestampRollbacks;
            mp4VideoTimestampDuplicates = audit == null ? 0 : audit.timestampDuplicates;
            mp4VideoSampleLimitReached = audit != null && audit.sampleLimitReached;
            mp4SampledFps = audit == null ? -1f : audit.sampledFps;
            mp4DurationMs = audit == null ? -1L : audit.durationMs;
            mp4TailVideoSamples = audit == null ? 0 : audit.tailSamples;
            mp4TailSampledFps = audit == null ? -1f : audit.tailSampledFps;
            mp4TailNearEnd = audit != null && audit.tailNearEnd;
            // A missing audio track is not a clean video+audio recording.
            // A missing parser result is UNKNOWN rather than "audio absent".
            boolean audioNotConfirmed = wantAudio &&
                (audit == null || !audit.audio || audit.audioSamples == 0);
            boolean videoMismatch = audit != null && audit.video &&
                audit.width > 0 && audit.height > 0 &&
                (audit.width != selectedWidth || audit.height != selectedHeight);
            boolean sampleIssue = audit != null &&
                (audit.videoSamples == 0 || audit.timestampRollbacks > 0 ||
                 audit.timestampDuplicates > 0);
            // A truncated tail is a warning only when a bounded scan and
            // file duration are both available, not when metadata is unknown.
            boolean tailIssue = audit != null && audit.durationMs > 0L &&
                audit.tailSamples > 0 && !audit.tailNearEnd;
            boolean incomplete = interruptedByCamera || audioNotConfirmed ||
                videoMismatch || sampleIssue || tailIssue || (audit != null && !audit.video);
            savedPath = media.getAbsolutePath();
            String gallery = publishVideo(media);
            savedUri = gallery == null ? "" : gallery;
            String message = interruptedByCamera
                ? "Камера была потеряна; непрерывность записи не подтверждена"
                : tailIssue
                    ? "MP4 сохранён, но конец видеодорожки не подтверждён"
                : audioNotConfirmed
                    ? "MP4 сохранён, но звуковые данные не подтверждены"
                    : sampleIssue
                        ? "MP4 сохранён, но обнаружена проблема видеокадров или меток времени"
                    : videoMismatch
                        ? "MP4 сохранён, но разрешение отличается от выбранного"
                        : audit != null && !audit.video
                            ? "MP4 сохранён, но видеодорожка не подтверждена"
                            : gallery == null
                                ? "MP4 в хранилище приложения; публикация в Галерее не удалась"
                                : "MP4 с видеодорожкой сохранён в Галерее";
            publish(incomplete ? "saved_interrupted" : "saved", message);
        } else if (!"error".equals(state)) {
            publish("interrupted", "Нативная запись не создала подтверждённый MP4.");
        }
        stopForeground(true);
        stopSelf();
    }
    /** Copy successfully finalized MP4 to system Gallery (no downloads/server). */
    private String publishVideo(File source) {
        Uri dest = null;
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Video.Media.DISPLAY_NAME, source.getName());
            values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            if (Build.VERSION.SDK_INT >= 29) {
                values.put(MediaStore.Video.Media.RELATIVE_PATH,
                    Environment.DIRECTORY_MOVIES + "/MULTI-CAM POV");
                values.put(MediaStore.Video.Media.IS_PENDING, 1);
            }
            dest = getContentResolver().insert(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values);
            if (dest == null) return null;
            try (FileInputStream input = new FileInputStream(source);
                 OutputStream output = getContentResolver().openOutputStream(dest)) {
                if (output == null) throw new IllegalStateException("MediaStore write failed");
                byte[] buf = new byte[65536];
                int size;
                long copied = 0L;
                while ((size = input.read(buf)) != -1) {
                    output.write(buf,0,size);
                    copied += size;
                }
                output.flush();
                // A partial copy is never a successful Gallery publication.
                if (copied != source.length() || copied < 1024)
                    throw new IllegalStateException("MediaStore: неполное копирование MP4");
            }
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues pending = new ContentValues();
                pending.put(MediaStore.Video.Media.IS_PENDING, 0);
                if (getContentResolver().update(dest,pending,null,null) <= 0)
                    throw new IllegalStateException("MediaStore не подтвердил публикацию");
            }
            return dest.toString();
        } catch(Exception error) {
            if (dest != null) try {getContentResolver().delete(dest,null,null);}catch(Exception ignored){}
            return null;
        }
    }
    @Override public void onDestroy() {
        if (encoder != null || camera != null) {
            stopRequested = true;
            // Shutdown is owned by Android service, NOT Activity/WebView.
            finish();
        }
        synchronized (STATE_LOCK) { if (runningInstance == this) runningInstance = null; }
        if (workerThread != null) workerThread.quitSafely();
        if (previewThread != null) previewThread.quitSafely();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
