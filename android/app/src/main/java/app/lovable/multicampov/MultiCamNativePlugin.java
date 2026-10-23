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
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.CamcorderProfile;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import android.media.MediaRecorder;
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
    private HandlerThread thread;
    private Handler handler;
    private CameraManager.AvailabilityCallback availabilityWatcher;
    private final Handler availabilityMainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void startCameraAvailability(PluginCall call) {
        try {
            if (availabilityWatcher == null) {
                availabilityWatcher = new CameraManager.AvailabilityCallback() {
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
                cameras().registerAvailabilityCallback(availabilityWatcher, availabilityMainHandler);
            }
            call.resolve();
        } catch (Exception e) { call.reject("Camera availability unavailable: " + e.getMessage()); }
    }
    @PluginMethod
    public void stopCameraAvailability(PluginCall call) { stopAvailability(); call.resolve(); }
    private void stopAvailability() {
        if (availabilityWatcher == null) return;
        cameras().unregisterAvailabilityCallback(availabilityWatcher);
        availabilityWatcher = null;
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
                    for (Range<Integer> r : map.getHighSpeedVideoFpsRangesFor(s)) rates.add(r.getUpper());
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
        res.put("status", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && pm != null ? pm.getCurrentThermalStatus() : 0);
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
        if (recorder != null) { call.reject("Запись уже идёт"); return; }
        String cameraId = call.getString("cameraId", "0");
        int width = call.getInt("width", 1280), height = call.getInt("height", 720), fps = call.getInt("fps", 120);
        try {
            CameraCharacteristics ch = cameras().getCameraCharacteristics(cameraId);
            StreamConfigurationMap map = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            Range<Integer> chosen = null;
            if (map != null) for (Range<Integer> r : map.getHighSpeedVideoFpsRangesFor(new Size(width, height))) if (r.getLower() == fps && r.getUpper() == fps) chosen = r;
            if (chosen == null) { call.reject("Режим " + width + "x" + height + "@" + fps + " не поддерживается сенсором"); return; }
            final Range<Integer> range = chosen;
            thread = new HandlerThread("multicam-hs"); thread.start(); handler = new Handler(thread.getLooper());
            output = new File(getContext().getExternalFilesDir(null), "slowmo-" + System.currentTimeMillis() + ".mp4");
            recorder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? new MediaRecorder(getContext()) : new MediaRecorder();
            recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
            recorder.setVideoSize(width, height);
            recorder.setVideoFrameRate(fps);
            recorder.setCaptureRate(fps);
            recorder.setVideoEncodingBitRate(width * height * fps / 4);
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
                                    JSObject res = new JSObject(); res.put("path", output.getAbsolutePath()); call.resolve(res);
                                } catch (CameraAccessException | IllegalStateException e) { cleanup(); call.reject("Ошибка запуска: " + e.getMessage()); }
                            }
                            @Override public void onConfigureFailed(CameraCaptureSession session) { cleanup(); call.reject("Сенсор отклонил high-speed сессию"); }
                        }, handler);
                    } catch (CameraAccessException e) { cleanup(); call.reject(e.getMessage()); }
                }
                @Override public void onDisconnected(CameraDevice cam) { cleanup(); }
                @Override public void onError(CameraDevice cam, int error) { cleanup(); call.reject("Ошибка камеры " + error); }
            }, handler);
        } catch (Exception e) { cleanup(); call.reject("Не удалось начать запись: " + e.getMessage()); }
    }

    @PluginMethod
    public void stopHighSpeedRecording(PluginCall call) {
        if (recorder == null) { call.reject("Запись не идёт"); return; }
        try { if (hsSession != null) hsSession.stopRepeating(); recorder.stop(); } catch (Exception ignored) { }
        JSObject res = new JSObject();
        res.put("path", output != null ? output.getAbsolutePath() : "");
        res.put("durationMs", System.currentTimeMillis() - startedAt);
        cleanup();
        call.resolve(res);
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) startHighSpeedRecording(call);
        else call.reject("Нет разрешения на камеру");
    }

    private void cleanup() {
        if (hsSession != null) { hsSession.close(); hsSession = null; }
        if (device != null) { device.close(); device = null; }
        if (recorder != null) { recorder.release(); recorder = null; }
        if (thread != null) { thread.quitSafely(); thread = null; }
    }
}
