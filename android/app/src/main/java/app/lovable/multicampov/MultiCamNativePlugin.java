package app.lovable.multicampov;

import android.Manifest;
import android.content.Context;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraConstrainedHighSpeedCaptureSession;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.hardware.camera2.params.DynamicRangeProfiles;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.CamcorderProfile;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaRecorder;
import android.media.MediaExtractor;
import android.media.MediaMetadataRetriever;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Range;
import android.util.Size;
import android.util.SizeF;
import android.view.Surface;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

@CapacitorPlugin(name = "MultiCamNative", permissions = {
        @Permission(alias = "camera", strings = {Manifest.permission.CAMERA}),
        @Permission(alias = "microphone", strings = {Manifest.permission.RECORD_AUDIO})
})
public class MultiCamNativePlugin extends Plugin {
    private CameraDevice device;
    private CameraConstrainedHighSpeedCaptureSession hsSession;
    private MediaRecorder recorder;
    private File output;
    private long startedAt;
    private volatile boolean highSpeedStarted = false;
    private volatile String highSpeedMode = "idle";

    private void reportHighSpeedState(String state, String message) {
        highSpeedMode = state;
        JSObject event = new JSObject();
        event.put("state", state);
        event.put("message", message);
        notifyListeners("highSpeedStateChanged", event);
    }
    private HandlerThread thread;
    private Handler handler;
    private CameraManager.AvailabilityCallback availabilityWatcher;
    // A folding Activity may create a new React listener before the old
    // WebView tears down. Track every owner so old cleanup cannot stop the
    // current availability observer.
    private final Set<String> availabilityOwners = new LinkedHashSet<>();
    private final Handler availabilityMainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void startCameraAvailability(PluginCall call) {
        String ownerId = call.getString("ownerId");
        if (ownerId == null || ownerId.isEmpty() || ownerId.length() > 128) {
            call.reject("Camera availability requires an ownerId"); return;
        }
        try {
            synchronized (availabilityOwners) {
                if (availabilityWatcher == null) {
                    CameraManager.AvailabilityCallback watcher = new CameraManager.AvailabilityCallback() {
                        @Override public void onCameraAvailable(String cameraId) {
                            JSObject ev = new JSObject(); ev.put("cameraId", cameraId);
                            ev.put("available", true);
                            notifyListeners("cameraAvailabilityChanged", ev);
                        }
                        @Override public void onCameraUnavailable(String cameraId) {
                            JSObject ev = new JSObject(); ev.put("cameraId", cameraId);
                            ev.put("available", false);
                            notifyListeners("cameraAvailabilityChanged", ev);
                        }
                    };
                    // Assign only after successful registration so an OEM
                    // exception never leaves a nonfunctional watcher installed.
                    cameras().registerAvailabilityCallback(watcher, availabilityMainHandler);
                    availabilityWatcher = watcher;
                }
                availabilityOwners.add(ownerId);
            }
            call.resolve();
        } catch (Exception e) { call.reject("Camera availability unavailable: " + e.getMessage()); }
    }
    @PluginMethod
    public void stopCameraAvailability(PluginCall call) {
        String ownerId = call.getString("ownerId");
        if (ownerId == null || ownerId.isEmpty()) {
            call.reject("Camera availability requires an ownerId"); return;
        }
        synchronized (availabilityOwners) {
            availabilityOwners.remove(ownerId);
            if (availabilityOwners.isEmpty()) stopAvailability();
        }
        call.resolve();
    }
    private void stopAvailability() {
        synchronized (availabilityOwners) {
            availabilityOwners.clear();
            if (availabilityWatcher == null) return;
            cameras().unregisterAvailabilityCallback(availabilityWatcher);
            availabilityWatcher = null;
        }
    }
    @Override protected void handleOnDestroy() {
        stopAvailability(); cleanup(); super.handleOnDestroy();
    }

    /** Encoder declarations are predictions, not proof that recording will succeed. */
    @PluginMethod
    public void getEncoderSupport(PluginCall call) {
        int width = call.getInt("width", 1920);
        int height = call.getInt("height", 1080);
        int fps = call.getInt("fps", 30);
        if (width <= 0 || width > 8192 || height <= 0 || height > 8192 || fps < 1 || fps > 960) {
            call.reject("Invalid width/height/fps"); return;
        }
        JSArray results = new JSArray();
        for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
            if (!info.isEncoder()) continue;
            for (String mime : info.getSupportedTypes()) {
                if (!mime.startsWith("video/")) continue;
                try {
                    MediaCodecInfo.CodecCapabilities codec = info.getCapabilitiesForType(mime);
                    MediaCodecInfo.VideoCapabilities video = codec.getVideoCapabilities();
                    if (video == null) continue;
                    JSObject item = new JSObject();
                    item.put("mime", mime); item.put("encoderName", info.getName());
                    item.put("declaredSizeRate", video.areSizeAndRateSupported(width, height, fps));
                    item.put("widthMin", video.getSupportedWidths().getLower());
                    item.put("widthMax", video.getSupportedWidths().getUpper());
                    item.put("heightMin", video.getSupportedHeights().getLower());
                    item.put("heightMax", video.getSupportedHeights().getUpper());
                    item.put("bitrateMin", video.getBitrateRange().getLower());
                    item.put("bitrateMax", video.getBitrateRange().getUpper());
                    item.put("hardwareAccelerated", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? (info.isHardwareAccelerated() ? "yes" : "no") : "unknown");
                    JSArray codecProfiles = new JSArray();
                    boolean hevcTenBit = false;
                    boolean hdr10Profile = false;
                    if (codec.profileLevels != null) {
                        for (MediaCodecInfo.CodecProfileLevel level : codec.profileLevels) {
                            JSObject p = new JSObject();
                            p.put("profileId", level.profile); p.put("levelId", level.level);
                            codecProfiles.put(p);
                            if ("video/hevc".equalsIgnoreCase(mime)) {
                                hevcTenBit |= level.profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10
                                    || level.profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10
                                    || level.profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10Plus;
                                hdr10Profile |= level.profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10
                                    || level.profile == MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10HDR10Plus;
                            }
                        }
                    }
                    item.put("codecProfiles", codecProfiles);
                    item.put("hevcTenBitCandidate", hevcTenBit);
                    item.put("hdr10ProfileDeclared", hdr10Profile);
                    item.put("hdrEditingFeatureDeclared", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                        ? codec.isFeatureSupported(MediaCodecInfo.CodecCapabilities.FEATURE_HdrEditing) : false);
                    results.put(item);
                } catch (RuntimeException ignored) {
                    // Unreliable vendor codec metadata must not invalidate other encoders.
                }
            }
        }
        JSObject result = new JSObject(); result.put("width", width);
        result.put("height", height); result.put("fps", fps);
        result.put("source", "MediaCodecInfo.VideoCapabilities");
        result.put("encoders", results);
        call.resolve(result);
    }


    private static String dynamicRangeName(long profile) {
        if (profile == DynamicRangeProfiles.STANDARD) return "SDR";
        if (profile == DynamicRangeProfiles.HLG10) return "HLG10";
        if (profile == DynamicRangeProfiles.HDR10) return "HDR10";
        if (profile == DynamicRangeProfiles.HDR10_PLUS) return "HDR10+";
        return "other:" + profile; // Never misclassify vendor/Dolby modes.
    }

    private static boolean hasMode(int[] values, int mode) { if (values == null) return false; for (int v : values) if (v == mode) return true; return false; }
    private CameraManager cameras() { return (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE); }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        try {
            JSArray list = new JSArray();
            for (String id : cameras().getCameraIdList()) {
                CameraCharacteristics ch = cameras().getCameraCharacteristics(id);
                StreamConfigurationMap map = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
                JSObject cam = new JSObject();
                Integer facing = ch.get(CameraCharacteristics.LENS_FACING);
                cam.put("cameraId", id);
                // Multi-camera membership is not equivalent to independently openable lenses.
                JSArray physical = new JSArray();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    for (String physicalId : ch.getPhysicalCameraIds()) physical.put(physicalId);
                }
                cam.put("physicalCameraIds", physical);
                Integer level = ch.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL);
                cam.put("hardwareLevel", level != null ? level : JSObject.NULL);
                Float minFocus = ch.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
                JSArray focusDistance = new JSArray();
                if (minFocus != null) { focusDistance.put(0); focusDistance.put(minFocus); cam.put("focusDistanceRange", focusDistance); }
                else cam.put("focusDistanceRange", JSObject.NULL);
                // Static hardware declarations are not verified recording capabilities.
                Integer orientation = ch.get(CameraCharacteristics.SENSOR_ORIENTATION);
                cam.put("sensorOrientation", orientation != null ? orientation : JSObject.NULL);
                SizeF sensor = ch.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
                if (sensor != null) {
                    JSArray physicalSize = new JSArray(); physicalSize.put(Float.valueOf(sensor.getWidth())); physicalSize.put(Float.valueOf(sensor.getHeight()));
                    cam.put("sensorSizeMm", physicalSize);
                } else cam.put("sensorSizeMm", JSObject.NULL);
                float[] focal = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
                JSArray focalArray = new JSArray(); if (focal != null) for (float length : focal) focalArray.put(Float.valueOf(length));
                cam.put("focalLengthsMm", focalArray);
                int[] eis = ch.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES);
                int[] ois = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION);
                JSArray eisArray = new JSArray(); JSArray oisArray = new JSArray();
                if (eis != null) for (int mode : eis) eisArray.put(mode);
                if (ois != null) for (int mode : ois) oisArray.put(mode);
                cam.put("eisModes", eisArray); cam.put("oisModes", oisArray);
                cam.put("eisDeclared", hasMode(eis, CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON));
                cam.put("oisDeclared", hasMode(ois, CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON));
                Range<Long> exposure = ch.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
                if (exposure != null) {
                    JSArray ns = new JSArray(); ns.put(exposure.getLower()); ns.put(exposure.getUpper());
                    cam.put("exposureTimeNs", ns);
                } else cam.put("exposureTimeNs", JSObject.NULL);
                cam.put("facing", facing != null && facing == CameraMetadata.LENS_FACING_FRONT ? "front" : facing != null && facing == CameraMetadata.LENS_FACING_BACK ? "back" : "external");
                JSArray sizes = new JSArray();
                if (map != null) for (Size s : map.getOutputSizes(MediaRecorder.class)) sizes.put(s.getWidth() + "x" + s.getHeight());
                cam.put("sizes", sizes);
                JSArray timedOutputs = new JSArray();
                if (map != null) {
                    Size[] recordingSizes = map.getOutputSizes(MediaRecorder.class);
                    if (recordingSizes != null) for (Size size : recordingSizes) {
                        JSObject mode = new JSObject();
                        mode.put("width", size.getWidth()); mode.put("height", size.getHeight());
                        try {
                            long minNs = map.getOutputMinFrameDuration(MediaRecorder.class, size);
                            mode.put("minFrameDurationNs", minNs);
                            if (minNs > 0) mode.put("theoreticalMaxFps", Math.floor(1_000_000_000.0 / minNs));
                        } catch (IllegalArgumentException ex) { mode.put("minFrameDurationNs", JSObject.NULL); }
                        timedOutputs.put(mode);
                    }
                }
                cam.put("videoOutputSizes", timedOutputs);
                JSArray fps = new JSArray();
                Range<Integer>[] ranges = ch.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
                if (ranges != null) for (Range<Integer> r : ranges) fps.put(r.getLower() + "-" + r.getUpper());
                cam.put("fpsRanges", fps);
                JSArray hs = new JSArray();
                int[] caps = ch.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
                boolean manual = false, hsSupported = false, rawSupported = false;
                if (caps != null) for (int c : caps) {
                    if (c == CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR) manual = true;
                    if (c == CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_CONSTRAINED_HIGH_SPEED_VIDEO) hsSupported = true;
                    if (c == CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_RAW) rawSupported = true;
                }
                if (hsSupported && map != null) for (Size s : map.getHighSpeedVideoSizes()) {
                    JSObject o = new JSObject();
                    o.put("size", s.getWidth() + "x" + s.getHeight());
                    Set<Integer> rates = new LinkedHashSet<>();
                    for (Range<Integer> r : map.getHighSpeedVideoFpsRangesFor(s))
                        if (r.getLower().equals(r.getUpper())) rates.add(r.getUpper());
                    JSArray ra = new JSArray(); for (Integer r : rates) ra.put(r);
                    o.put("fps", ra); hs.put(o);
                }
                cam.put("highSpeed", hs);
                JSArray profiles = new JSArray();
                int[] q = {CamcorderProfile.QUALITY_480P, CamcorderProfile.QUALITY_720P, CamcorderProfile.QUALITY_1080P, CamcorderProfile.QUALITY_2160P, CamcorderProfile.QUALITY_HIGH_SPEED_720P, CamcorderProfile.QUALITY_HIGH_SPEED_1080P};
                String[] qn = {"480p", "720p", "1080p", "2160p", "hs720p", "hs1080p"};
                try { int idNum = Integer.parseInt(id); for (int i = 0; i < q.length; i++) if (CamcorderProfile.hasProfile(idNum, q[i])) profiles.put(qn[i]); } catch (NumberFormatException ignored) { }
                cam.put("profiles", profiles);
                Range<Integer> iso = ch.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
                if (iso != null) { JSArray isoArr = new JSArray(); isoArr.put(iso.getLower()); isoArr.put(iso.getUpper()); cam.put("isoRange", isoArr); } else cam.put("isoRange", JSObject.NULL);
                cam.put("manualSensor", manual);
                cam.put("raw", rawSupported);
                int[] tone = ch.get(CameraCharacteristics.TONEMAP_AVAILABLE_TONE_MAP_MODES);
                boolean curve = false; if (tone != null) for (int t : tone) if (t == CameraMetadata.TONEMAP_MODE_CONTRAST_CURVE) curve = true;
                cam.put("toneCurve", curve);
                // Android 13+ advertises real Camera2 per-camera dynamic-range profiles.
                // These are declarations, not proof of an HDR recording/encoding/export path.
                JSArray hdrProfiles = new JSArray();
                boolean tenBitCapability = false;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    tenBitCapability = hasMode(caps, CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_DYNAMIC_RANGE_TEN_BIT);
                    DynamicRangeProfiles supportedRanges =
                        ch.get(CameraCharacteristics.REQUEST_AVAILABLE_DYNAMIC_RANGE_PROFILES);
                    if (supportedRanges != null) {
                        for (Long value : supportedRanges.getSupportedProfiles()) {
                            JSObject item = new JSObject();
                            item.put("id", value);
                            item.put("name", dynamicRangeName(value));
                            item.put("extraLatencyDeclared", supportedRanges.isExtraLatencyPresent(value));
                            JSArray compatible = new JSArray();
                            for (Long possible : supportedRanges.getProfileCaptureRequestConstraints(value)) {
                                compatible.put(dynamicRangeName(possible));
                            }
                            item.put("compatibleProfiles", compatible);
                            hdrProfiles.put(item);
                        }
                    }
                }
                cam.put("dynamicRangeApiAvailable", Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU);
                cam.put("tenBitOutputDeclared", tenBitCapability);
                cam.put("dynamicRangeProfiles", hdrProfiles);
                cam.put("hdrRecordedAndVerified", false);
                list.put(cam);
            }
            JSArray codecs = new JSArray();
            Set<String> seen = new LinkedHashSet<>();
            for (MediaCodecInfo info : new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
                if (!info.isEncoder()) continue;
                for (String type : info.getSupportedTypes()) if (type.startsWith("video/") && seen.add(type)) codecs.put(type);
            }
            JSArray concurrent = new JSArray();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R)
                for (Set<String> group : cameras().getConcurrentCameraIds()) {
                    JSArray ids = new JSArray(); for (String id : group) ids.put(id);
                    concurrent.put(ids);
                }
            JSObject res = new JSObject(); res.put("cameras", list); res.put("codecs", codecs); res.put("concurrentCameraGroups", concurrent);
            call.resolve(res);
        } catch (CameraAccessException | SecurityException e) {
            call.reject("Не удалось опросить камеру: " + e.getMessage());
        }
    }

    @PluginMethod
    public void getThermalStatus(PluginCall call) {
        JSObject res = new JSObject();
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        // API below 29 has no framework thermal status. Do not report "normal" by default.
        res.put("status", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm != null ? pm.getCurrentThermalStatus() : -1);
        res.put("available", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm != null);
        float headroom = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && pm != null ? pm.getThermalHeadroom(10) : Float.NaN;
        res.put("headroom", Float.isNaN(headroom) ? JSObject.NULL : headroom);
        res.put("temperatureC", JSObject.NULL);
        call.resolve(res);
    }

    @PluginMethod
    public void listAudioInputs(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        JSArray arr = new JSArray();
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            JSObject o = new JSObject();
            o.put("id", String.valueOf(d.getId()));
            o.put("name", String.valueOf(d.getProductName()));
            int t = d.getType();
            o.put("type", t == AudioDeviceInfo.TYPE_USB_DEVICE || t == AudioDeviceInfo.TYPE_USB_HEADSET ? "usb" : t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ? "bluetooth" : t == AudioDeviceInfo.TYPE_WIRED_HEADSET ? "wired" : "builtin");
            arr.put(o);
        }
        JSObject res = new JSObject(); res.put("inputs", arr); call.resolve(res);
    }

    @PluginMethod
    public void setPreferredAudioInput(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        String id = call.getString("id", "");
        boolean ok = false;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_INPUTS)) {
            if (!String.valueOf(d.getId()).equals(id)) continue;
            if (d.getType() == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) ok = am.setCommunicationDevice(d);
                else { am.startBluetoothSco(); am.setBluetoothScoOn(true); ok = true; }
            } else ok = true;
        }
        JSObject res = new JSObject(); res.put("ok", ok); call.resolve(res);
    }

    @PluginMethod
    public void startHighSpeedRecording(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) { requestPermissionForAlias("camera", call, "permissionCallback"); return; }
        if (recorder != null) { call.reject("Запись уже идёт или запускается"); return; }
        String cameraId = call.getString("cameraId", "0");
        int width = call.getInt("width", 1280), height = call.getInt("height", 720), fps = call.getInt("fps", 120);
        if (width <= 0 || height <= 0 || fps < 60 || fps > 960) { call.reject("Некорректные параметры high-speed"); return; }
        highSpeedStarted = false;
        reportHighSpeedState("starting", "Открытие Camera2 high-speed сессии");
        try {
            CameraCharacteristics ch = cameras().getCameraCharacteristics(cameraId);
            StreamConfigurationMap map = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            Range<Integer> chosen = null;
            if (map != null) {
                Size requestedSize = new Size(width, height);
                boolean sizeAvailable = false;
                for (Size size : map.getHighSpeedVideoSizes()) if (size.equals(requestedSize)) { sizeAvailable = true; break; }
                if (sizeAvailable) for (Range<Integer> r : map.getHighSpeedVideoFpsRangesFor(requestedSize))
                    if (r.getLower() == fps && r.getUpper() == fps) { chosen = r; break; }
            }
            if (chosen == null) { reportHighSpeedState("idle", "Режим не поддерживается"); call.reject("Режим " + width + "x" + height + "@" + fps + " не поддерживается сенсором"); return; }
            final Range<Integer> range = chosen;
            thread = new HandlerThread("multicam-hs"); thread.start(); handler = new Handler(thread.getLooper());
            File outputDir = getContext().getExternalFilesDir(null);
            if (outputDir == null) throw new IllegalStateException("Каталог видеозаписей Android недоступен");
            output = new File(outputDir, "slowmo-" + System.currentTimeMillis() + ".mp4");
            recorder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? new MediaRecorder(getContext()) : new MediaRecorder();
            recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
            recorder.setVideoSize(width, height);
            recorder.setVideoFrameRate(fps);
            recorder.setCaptureRate(fps);
            // Integer multiplication overflows at common 4K high-speed rates.
            // Cap the target to a conservative Android MediaRecorder integer
            // range; the actual encoder may still reject this configuration.
            long requestedBitRate = ((long) width * (long) height * (long) fps) / 4L;
            int safeBitRate = (int) Math.min(80_000_000L, Math.max(2_000_000L, requestedBitRate));
            recorder.setVideoEncodingBitRate(safeBitRate);
            recorder.setOutputFile(output.getAbsolutePath());
            recorder.prepare();
            final Surface surface = recorder.getSurface();
            cameras().openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice cam) {
                    device = cam;
                    try {
                        List<Surface> targets = new ArrayList<>(); targets.add(surface);
                        cam.createConstrainedHighSpeedCaptureSession(targets, new CameraCaptureSession.StateCallback() {
                            @Override public void onConfigured(CameraCaptureSession session) {
                                try {
                                    hsSession = (CameraConstrainedHighSpeedCaptureSession) session;
                                    CaptureRequest.Builder b = cam.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);
                                    b.addTarget(surface);
                                    b.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, range);
                                    hsSession.setRepeatingBurst(hsSession.createHighSpeedRequestList(b.build()), null, handler);
                                    recorder.start(); startedAt = System.currentTimeMillis();
                                    highSpeedStarted = true;
                                    reportHighSpeedState("recording", "Настоящая Camera2 high-speed запись запущена");
                                    JSObject res = new JSObject(); res.put("path", output.getAbsolutePath()); call.resolve(res);
                                } catch (CameraAccessException | IllegalStateException e) { cleanup(); reportHighSpeedState("error", e.getMessage()); call.reject("Ошибка запуска: " + e.getMessage()); }
                            }
                            @Override public void onConfigureFailed(CameraCaptureSession session) { cleanup(); reportHighSpeedState("error", "Сенсор отклонил сессию"); call.reject("Сенсор отклонил high-speed сессию"); }
                        }, handler);
                    } catch (CameraAccessException e) { cleanup(); reportHighSpeedState("error", e.getMessage()); call.reject(e.getMessage()); }
                }
                @Override public void onDisconnected(CameraDevice cam) {
                    boolean wasRecording = highSpeedStarted;
                    cleanup(); reportHighSpeedState("error", "Камера отключена");
                    if (!wasRecording) call.reject("Камера отключена во время запуска");
                }
                @Override public void onError(CameraDevice cam, int error) {
                    boolean wasRecording = highSpeedStarted;
                    cleanup(); reportHighSpeedState("error", "Ошибка камеры " + error);
                    if (!wasRecording) call.reject("Ошибка камеры " + error);
                }
            }, handler);
        } catch (Exception e) { cleanup(); reportHighSpeedState("error", e.getMessage()); call.reject("Не удалось начать запись: " + e.getMessage()); }
    }


    /**
     * Analyze actual persisted app-owned MP4 rather than reported sensor/encoder
     * capabilities. The sampled presentation timestamps are from the video
     * track; variable frame rate and sparse/truncated samples are disclosed.
     */
    @PluginMethod
    public void inspectVideoFile(PluginCall call) {
        final String requested = call.getString("path", "");
        if (requested == null || requested.isEmpty()) { call.reject("Путь MP4 не указан"); return; }
        try {
            final File root = getContext().getExternalFilesDir(null);
            if (root == null) throw new IllegalStateException("Внутренняя папка видео недоступна");
            final File allowed = root.getCanonicalFile();
            final File file = new File(requested).getCanonicalFile();
            if (!file.getPath().startsWith(allowed.getPath() + File.separator)) {
                call.reject("Доступ разрешён только к видеозаписям приложения");
                return;
            }
            if (!file.isFile() || file.length() < 1024) { call.reject("Файл MP4 отсутствует или пуст"); return; }
            call.resolve(inspectRecordedFile(file));
        } catch (Exception error) {
            call.reject("Анализ сохранённого MP4 невозможен: " + error.getMessage());
        }
    }

    private static JSObject inspectRecordedFile(File file) throws Exception {
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(file.getAbsolutePath());
            MediaFormat video = null;
            int videoTrack = -1;
            int audioTracks = 0;
            int firstAudioTrack = -1;
            String audioMime = null;
            for (int index = 0; index < extractor.getTrackCount(); index++) {
                MediaFormat candidate = extractor.getTrackFormat(index);
                final String mime = candidate.getString(MediaFormat.KEY_MIME);
                if (mime != null && mime.startsWith("audio/")) {
                    audioTracks++;
                    if (audioMime == null) { audioMime = mime; firstAudioTrack = index; }
                }
                if (videoTrack < 0 && mime != null && mime.startsWith("video/")) {
                    video = candidate; videoTrack = index;
                }
            }
            if (videoTrack < 0 || video == null)
                throw new IllegalStateException("В MP4 нет видеодорожки");
            JSObject result = new JSObject();
            result.put("path", file.getAbsolutePath());
            result.put("bytes", file.length());
            result.put("audioTrackCount", audioTracks);
            result.put("audioMime", audioMime != null ? audioMime : JSObject.NULL);
            result.put("audioSamplesDecoded", false);
            result.put("audioNote", audioTracks > 0 ? "Аудиодорожка обнаружена; звук не декодирован и не прослушан" : "Аудиодорожка не обнаружена; для записи без микрофона это может быть ожидаемо");
            result.put("mime", video.getString(MediaFormat.KEY_MIME));
            result.put("width", valueOrUnknown(video, MediaFormat.KEY_WIDTH));
            result.put("height", valueOrUnknown(video, MediaFormat.KEY_HEIGHT));
            result.put("declaredFrameRate", valueOrUnknown(video, MediaFormat.KEY_FRAME_RATE));
            result.put("durationUs", valueOrUnknownLong(video, MediaFormat.KEY_DURATION));
            result.put("colorStandard", valueOrUnknown(video, MediaFormat.KEY_COLOR_STANDARD));
            result.put("colorTransfer", valueOrUnknown(video, MediaFormat.KEY_COLOR_TRANSFER));
            result.put("colorRange", valueOrUnknown(video, MediaFormat.KEY_COLOR_RANGE));
            result.put("hdrStaticInfoPresent", video.containsKey(MediaFormat.KEY_HDR_STATIC_INFO));
            result.put("source", "MediaExtractor: saved encoded video track");
            result.put("hdrRecordingVerified", false); // Metadata alone never verifies true HDR.
            extractor.selectTrack(videoTrack);
            long earliest = Long.MAX_VALUE, latest = Long.MIN_VALUE;
            long previous = -1, positiveDelta = 0;
            int samples = 0, reordered = 0, repeated = 0;
            // Limit CPU work on long recordings; a bounded sample is NOT the
            // complete video's FPS and does not prove all frames exist.
            while (samples < 600) {
                long time = extractor.getSampleTime();
                if (time < 0) break;
                earliest = Math.min(earliest, time);
                latest = Math.max(latest, time);
                if (previous >= 0) {
                    if (time > previous) positiveDelta++;
                    else if (time < previous) reordered++;
                    else repeated++;
                }
                previous = time;
                samples++;
                if (!extractor.advance()) break;
            }
            long span = latest > earliest ? latest - earliest : 0;
            double estimated = span > 200000 && samples > 7 ? ((samples - 1) * 1000000.0 / span) : 0;
            result.put("samplesRead", samples);
            result.put("timestampSpanUs", span);
            result.put("outOfOrderPresentationTimes", reordered);
            result.put("duplicatePresentationTimes", repeated);
            // A video track with reversed or duplicate presentation timestamps
            // must never emit an apparently precise recorded-FPS estimate.
            result.put("estimatedSampleFps", reordered == 0 && repeated == 0 &&
                    positiveDelta == samples - 1 && estimated >= 1 && estimated <= 960
                ? Math.round(estimated * 10.0) / 10.0 : JSObject.NULL);
            result.put("sampleLimitReached", samples == 600);
            // Independently seek near the CONTAINER-DECLARED end. Reading only
            // the first 600 encoded samples cannot detect a clipped tail.
            // Seek may land at an earlier sync frame (or fail altogether),
            // so report tail evidence separately and never call it a full scan.
            long declaredDurationUs = -1L;
            try { if (video.containsKey(MediaFormat.KEY_DURATION))
                declaredDurationUs = video.getLong(MediaFormat.KEY_DURATION); }
            catch (RuntimeException ignored) { /* Some OEMs omit duration. */ }
            int tailSamples = 0, tailBackwards = 0, tailDuplicates = 0;
            long tailFirst = -1L, tailLast = -1L, tailPrevious = -1L;
            if (declaredDurationUs > 5_000_000L) {
                try {
                    extractor.seekTo(Math.max(0L, declaredDurationUs - 4_000_000L),
                        MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                    while (tailSamples < 300) {
                        long t = extractor.getSampleTime();
                        if (t < 0) break;
                        if (tailFirst < 0) tailFirst = t;
                        if (tailPrevious >= 0) {
                            if (t < tailPrevious) tailBackwards++;
                            else if (t == tailPrevious) tailDuplicates++;
                        }
                        tailLast = t;
                        tailPrevious = t;
                        tailSamples++;
                        if (!extractor.advance()) break;
                    }
                } catch (RuntimeException ignored) {
                    // Unsupported seek is UNKNOWN, not damaged recorded data.
                    tailSamples = 0;
                    tailFirst = -1L;
                    tailLast = -1L;
                }
            }
            long tailSpanUs = tailLast > tailFirst ? tailLast - tailFirst : 0L;
            double tailRate = tailSpanUs > 200_000L && tailSamples > 7
                ? (tailSamples - 1) * 1_000_000.0 / tailSpanUs : 0.0;
            boolean tailTimestampsValid = tailBackwards == 0 && tailDuplicates == 0;
            boolean tailNearEnd = declaredDurationUs > 0 && tailLast >= 0 &&
                tailLast >= declaredDurationUs - 2_000_000L &&
                tailLast <= declaredDurationUs + 2_000_000L;
            result.put("tailSamplesRead", tailSamples);
            result.put("tailFirstPresentationTimeUs", tailFirst >= 0 ? tailFirst : JSObject.NULL);
            result.put("tailLastPresentationTimeUs", tailLast >= 0 ? tailLast : JSObject.NULL);
            result.put("tailOutOfOrderPresentationTimes", tailBackwards);
            result.put("tailDuplicatePresentationTimes", tailDuplicates);
            result.put("tailSampleNearDeclaredEnd", declaredDurationUs > 0 && tailSamples > 0
                ? Boolean.valueOf(tailNearEnd) : JSObject.NULL);
            result.put("tailEstimatedSampleFps",
                tailTimestampsValid && tailRate >= 1 && tailRate <= 960 &&
                tailSamples > 7 ? Math.round(tailRate * 10.0) / 10.0 : JSObject.NULL);
            result.put("fileEndVerified", false); // A sample near the end is NOT a full decode.
            // A track declaration does NOT mean actual encoded audio samples
            // exist. Independently inspect a bounded head sample window.
            // High-speed Camera2 capture is commonly video-only by design.
            int audioSamplesRead = 0, audioTimestampRollbacks = 0, audioRepeatedTimes = 0;
            long audioFirstUs = -1L, audioLastUs = -1L, audioPreviousUs = -1L;
            boolean audioSampleInspectionFailed = false;
            if (firstAudioTrack >= 0) {
                try {
                    extractor.unselectTrack(videoTrack);
                    extractor.selectTrack(firstAudioTrack);
                    while (audioSamplesRead < 300) {
                        long pts = extractor.getSampleTime();
                        if (pts < 0) break;
                        if (audioFirstUs < 0) audioFirstUs = pts;
                        if (audioPreviousUs >= 0) {
                            if (pts < audioPreviousUs) audioTimestampRollbacks++;
                            else if (pts == audioPreviousUs) audioRepeatedTimes++;
                        }
                        audioLastUs = pts;
                        audioPreviousUs = pts;
                        audioSamplesRead++;
                        if (!extractor.advance()) break;
                    }
                } catch (RuntimeException error) {
                    audioSampleInspectionFailed = true;
                    audioSamplesRead = 0;
                    audioFirstUs = -1L; audioLastUs = -1L;
                }
            }
            result.put("audioSamplesRead", audioSamplesRead);
            result.put("audioSamplePresentationStartUs", audioFirstUs >= 0 ? audioFirstUs : JSObject.NULL);
            result.put("audioSamplePresentationEndUs", audioLastUs >= 0 ? audioLastUs : JSObject.NULL);
            result.put("audioSampleTimestampRollbacks", audioTimestampRollbacks);
            result.put("audioSampleTimestampDuplicates", audioRepeatedTimes);
            result.put("audioSampleInspectionFailed", audioSampleInspectionFailed);
            result.put("audioSamplesDecoded", false);
            result.put("audioFidelityVerified", false);

            // Video rotation is metadata only, not proof of visible orientation
            // after front-facing mirroring, overlays or editor export.
            MediaMetadataRetriever retriever = new MediaMetadataRetriever();
            try {
                retriever.setDataSource(file.getAbsolutePath());
                String rotation = retriever.extractMetadata(
                    MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION);
                int degrees = rotation != null ? Integer.parseInt(rotation) : -1;
                result.put("rotationDegrees", degrees == 0 || degrees == 90 ||
                    degrees == 180 || degrees == 270 ? degrees : JSObject.NULL);
            } catch (Exception ignored) {
                result.put("rotationDegrees", JSObject.NULL);
            } finally {
                retriever.release();
            }
            result.put("fpsMethod", "Bounded MP4 head + near-tail encoded sample timestamps; not camera sensor FPS, all-frame continuity or full video decode");
            return result;
        } finally {
            extractor.release();
        }
    }
    private static Object valueOrUnknown(MediaFormat format, String key) {
        if (!format.containsKey(key)) return JSObject.NULL;
        try { return format.getInteger(key); } catch (Exception ex) { return JSObject.NULL; }
    }
    private static Object valueOrUnknownLong(MediaFormat format, String key) {
        if (!format.containsKey(key)) return JSObject.NULL;
        try { return format.getLong(key); } catch (Exception ex) { return JSObject.NULL; }
    }

    @PluginMethod
    public void stopHighSpeedRecording(PluginCall call) {
        if (recorder == null || !highSpeedStarted) { call.reject("Подтверждённой записи нет"); return; }
        reportHighSpeedState("stopping", "Завершение видеокодирования");
        final File saved = output;
        final long durationMs = System.currentTimeMillis() - startedAt;
        try {
            if (hsSession != null) hsSession.stopRepeating();
            recorder.stop(); // MediaRecorder throws if no valid data was encoded.
            cleanup();
            if (saved == null || !saved.isFile() || saved.length() < 1024) {
                reportHighSpeedState("error", "Видео не сохранилось или файл пуст");
                call.reject("High-speed видео не сохранено: пустой файл");
                return;
            }
            JSObject res = new JSObject();
            res.put("path", saved.getAbsolutePath());
            res.put("durationMs", durationMs);
            res.put("bytes", saved.length());
            try {
                JSObject inspected = inspectRecordedFile(saved);
                res.put("inspection", inspected);
                reportHighSpeedState("saved", "MP4 создан и видеодорожка прочитана");
            } catch (Exception inspectError) {
                res.put("inspectionError", inspectError.getMessage());
                reportHighSpeedState("saved", "MP4 сохранён, но его видеодорожка не проверена");
            }
            call.resolve(res);
        } catch (Exception error) {
            cleanup();
            reportHighSpeedState("error", "Не удалось завершить запись: " + error.getMessage());
            call.reject("High-speed запись повреждена или не сохранена: " + error.getMessage());
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) startHighSpeedRecording(call);
        else call.reject("Нет разрешения на камеру");
    }

    private void cleanup() {
        highSpeedStarted = false;
        if (hsSession != null) { hsSession.close(); hsSession = null; }
        if (device != null) { device.close(); device = null; }
        if (recorder != null) { recorder.release(); recorder = null; }
        if (thread != null) { thread.quitSafely(); thread = null; }
    }
}
