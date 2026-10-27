
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
import android.media.MediaRecorder;
import android.media.ImageReader;
import android.media.Image;
import android.graphics.ImageFormat;
import java.util.ArrayList;
import android.media.MediaMetadataRetriever;
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

    private HandlerThread workerThread;
    private Handler worker;
    private CameraDevice camera;
    private CameraCaptureSession capture;
    private MediaRecorder encoder;
    private ImageReader previewReader;
    private volatile boolean previewConsumerVisible;
    public static void setPreviewConsumerVisible(boolean visible) {
        synchronized (STATE_LOCK) {
            if(runningInstance!=null) {
                runningInstance.previewConsumerVisible=visible;
                if(!visible)runningInstance.latestPreviewJpeg=null;
            }
        }
    }
    private volatile String latestPreviewJpeg;
    private volatile long latestPreviewAt;
    private File media;
    private boolean encoderStarted;
    private boolean encoderPaused;
    private boolean stopRequested;
    private boolean wantAudio;
    private boolean interruptedByCamera;
    private int generation = 0;
    private Runnable openingTimeout;

    public static com.getcapacitor.JSObject previewFrame() {
        com.getcapacitor.JSObject result = new com.getcapacitor.JSObject();
        synchronized (STATE_LOCK) {
            NativeCaptureService service = runningInstance;
            if (service != null && service.latestPreviewJpeg != null
                && System.currentTimeMillis() - service.latestPreviewAt < 3000) {
                result.put("jpeg", service.latestPreviewJpeg);
            } else result.put("jpeg", "");
        }
        return result;
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
            out.put("orientationDegrees", runningInstance == null
                ? context.getSharedPreferences(STORE, MODE_PRIVATE).getInt("orientation", -1)
                : recordedOrientation);
            out.put("stabilization", stab);
            out.put("stabilizationCaptureResultObserved", observed);
            out.put("savedBytes", !path.isEmpty() && new File(path).isFile()
                ? new File(path).length() : 0L);
            out.put("savedUri", uri);
            out.put("videoOnly", !context.getSharedPreferences(STORE, MODE_PRIVATE)
                .getBoolean("recordAudio", false));
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
                .putBoolean("recordAudio", wantAudio).apply();
        }
    }
    @Override public void onCreate() {
        super.onCreate();
        workerThread = new HandlerThread("Native-Camera2-Record");
        workerThread.start();
        worker = new Handler(workerThread.getLooper());
        synchronized (STATE_LOCK) { runningInstance = this; }
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
        }
        publish("starting", "Открываю Camera2 и кодировщик");
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
            StreamConfigurationMap map =
                info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            boolean supported = false;
            if (map != null && map.getOutputSizes(MediaRecorder.class) != null)
                for (Size size : map.getOutputSizes(MediaRecorder.class))
                    if (size.getWidth() == width && size.getHeight() == height)
                        supported = true;
            if (!supported) throw new IllegalArgumentException("Камера не поддерживает это разрешение");
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
            encoder.setVideoEncodingBitRate(Math.min(16000000, Math.max(1500000,
                width * height * fps / 9)));
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
                    previewReader.setOnImageAvailableListener(reader -> {
                        Image frame = null;
                        try {
                            frame = reader.acquireLatestImage();
                            if (frame != null && previewConsumerVisible &&
                                System.currentTimeMillis()-latestPreviewAt>=350) {
                                String jpeg = NativePreviewFrames.compressYuv420(frame);
                                if (jpeg != null) {
                                    latestPreviewJpeg=jpeg;latestPreviewAt=System.currentTimeMillis();
                                }
                            }
                        } catch(Exception ignored) {}
                        finally {if(frame!=null)frame.close();}
                    },worker);
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
                        request.set(CaptureRequest.CONTROL_AF_MODE,
                            CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO);
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
                        opened.createCaptureSession(outputs,
                            new CameraCaptureSession.StateCallback() {
                                @Override public void onConfigured(CameraCaptureSession sessionHandle) {
                                    if (session != generation || stopRequested) {
                                        sessionHandle.close(); finish(); return;
                                    }
                                    capture = sessionHandle;
                                    try {
                                        capture.setRepeatingRequest(request.build(),
                                            new CameraCaptureSession.CaptureCallback() {
                                                @Override public void onCaptureCompleted(
                                                    CameraCaptureSession session,
                                                    CaptureRequest request,
                                                    TotalCaptureResult result) {
                                                    if (stabilizationResultSeen) return;
                                                    Integer appliedEis = result.get(
                                                        CaptureResult.CONTROL_VIDEO_STABILIZATION_MODE);
                                                    Integer appliedOis = result.get(
                                                        CaptureResult.LENS_OPTICAL_STABILIZATION_MODE);
                                                    if (appliedEis != null || appliedOis != null) {
                                                        stabilizationResultSeen = true;
                                                        chosenStabilization =
                                                            appliedEis != null &&
                                                            appliedEis == CaptureResult.CONTROL_VIDEO_STABILIZATION_MODE_ON
                                                                ? "EIS CaptureResult ON" :
                                                            appliedOis != null &&
                                                            appliedOis == CaptureResult.LENS_OPTICAL_STABILIZATION_MODE_ON
                                                                ? "OIS CaptureResult ON" :
                                                                "CaptureResult stabilization OFF";
                                                        publish(state, lastMessage);
                                                    }
                                                }
                                            }, worker);
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
                                        opened.createCaptureSession(Arrays.asList(surface),
                                            new CameraCaptureSession.StateCallback() {
                                                @Override public void onConfigured(CameraCaptureSession ready) {
                                                    capture=ready;
                                                    try {
                                                        capture.setRepeatingRequest(only.build(),null,worker);
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
        latestPreviewJpeg = null; latestPreviewAt = 0;
        if(previewReader!=null){try{previewReader.close();}catch(Exception ignored){}previewReader=null;}
        if (capture != null) {
            try { capture.stopRepeating();capture.abortCaptures(); } catch(Exception ignored) {}
            try { capture.close(); } catch(Exception ignored) {}
            capture = null;
        }
        if (camera != null) { try {camera.close();}catch(Exception ignored){}camera=null; }
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
        if (encoder == null && camera == null) { stopSelf(); return; }
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
            savedPath = media.getAbsolutePath();
            String gallery = publishVideo(media);
            savedUri = gallery == null ? "" : gallery;
            publish(interruptedByCamera ? "saved_interrupted" : "saved",
                interruptedByCamera ? "Камера была потеряна: сохранён только завершённый сегмент MP4; непрерывность не подтверждена" :
                gallery == null ? "MP4 записан в защищённое хранилище приложения; публикация в Галерее не удалась"
                : "Настоящий MP4 сохранён в Галерее");
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
                while ((size = input.read(buf)) != -1) output.write(buf,0,size);
            }
            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues pending = new ContentValues();
                pending.put(MediaStore.Video.Media.IS_PENDING, 0);
                getContentResolver().update(dest,pending,null,null);
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
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
