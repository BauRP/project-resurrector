package app.lovable.multicampov;

import android.Manifest;
import android.content.Context;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.CaptureResult;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Size;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Real Camera2 CaptureResult probe for EIS/OIS on one specific camera and YUV size.
 * This is an isolated preview-only diagnostic. It does NOT prove the active WebView
 * recording or encoded output uses the same configuration or is stabilized.
 */
@CapacitorPlugin(name = "StabilizationProbe", permissions = {
    @Permission(alias = "camera", strings = {Manifest.permission.CAMERA})
})
public class StabilizationProbePlugin extends Plugin {
    private final AtomicBoolean occupied = new AtomicBoolean(false);
    private volatile Probe active;

    @PluginMethod
    public void probe(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "onCameraPermission");
            return;
        }
        if (!occupied.compareAndSet(false, true)) {
            call.reject("Проверка другой камеры ещё выполняется");
            return;
        }
        final String cameraId = call.getString("cameraId", "");
        final int width = call.getInt("width", 1280);
        final int height = call.getInt("height", 720);
        final int fps = call.getInt("fps", 30);
        try {
            if (cameraId.isEmpty() || width < 160 || width > 4096 || height < 120 || height > 4096 || fps < 1 || fps > 120) {
                throw new IllegalArgumentException("Неверный Camera2 ID, размер или FPS");
            }
            CameraManager manager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            if (manager == null) throw new IllegalStateException("CameraManager недоступен");
            CameraCharacteristics ch = manager.getCameraCharacteristics(cameraId);
            StreamConfigurationMap outputs = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            boolean yuvSize = false;
            if (outputs != null) {
                Size[] supported = outputs.getOutputSizes(ImageFormat.YUV_420_888);
                if (supported != null) for (Size size : supported) {
                    if (size.getWidth() == width && size.getHeight() == height) { yuvSize = true; break; }
                }
            }
            int[] eisModes = ch.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES);
            int[] oisModes = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION);
            boolean eis = contains(eisModes, CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON);
            boolean preview = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                contains(eisModes, CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_PREVIEW_STABILIZATION);
            boolean ois = contains(oisModes, CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON);
            final String choice = eis ? "eis" : preview ? "preview-stabilization" : ois ? "ois" : "none";
            if (!yuvSize || "none".equals(choice)) {
                JSObject result = base(cameraId, width, height, fps, choice, eis, preview, ois);
                result.put("state", !yuvSize ? "unknown" : "declared-unavailable");
                result.put("message", !yuvSize ? "YUV поток такого размера не раскрыт; видеорежим не проверен" :
                    "Camera2 не объявляет EIS, PREVIEW_STABILIZATION или OIS для этой камеры");
                occupied.set(false); call.resolve(result); return;
            }
            Probe probe = new Probe(call, manager, cameraId, width, height, fps, choice, eis, preview, ois);
            active = probe;
            probe.start();
        } catch (Exception error) {
            occupied.set(false);
            call.reject("Пробная стабилизация не запущена: " + error.getMessage());
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void onCameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) probe(call);
        else call.reject("Нет разрешения CAMERA");
    }

    private static boolean contains(int[] values, int target) {
        if (values == null) return false;
        for (int value : values) if (value == target) return true;
        return false;
    }
    private static JSObject base(String cameraId, int w, int h, int fps, String choice,
                                 boolean eis, boolean preview, boolean ois) {
        JSObject obj = new JSObject();
        obj.put("cameraId", cameraId);
        obj.put("width", w); obj.put("height", h); obj.put("fpsRequested", fps);
        obj.put("selected", choice);
        obj.put("eisDeclared", eis); obj.put("previewDeclared", preview); obj.put("oisDeclared", ois);
        obj.put("source", "camera2-capture-result");
        obj.put("recordedFileVerified", false);
        return obj;
    }

    @Override protected void handleOnDestroy() {
        Probe p = active;
        if (p != null) p.fail("Проверка прервана закрытием приложения");
        super.handleOnDestroy();
    }

    private final class Probe {
        final PluginCall call;
        final CameraManager manager;
        final String id;
        final int width, height, fps;
        final String choice;
        final boolean eis, preview, ois;
        final AtomicBoolean finished = new AtomicBoolean(false);
        HandlerThread worker;
        Handler handler;
        CameraDevice device;
        CameraCaptureSession session;
        ImageReader reader;
        int frames = 0;
        int confirmed = 0;
        int lastEis = -1;
        int lastOis = -1;
        boolean hasResults = false;

        Probe(PluginCall call, CameraManager manager, String id, int width, int height, int fps,
              String choice, boolean eis, boolean preview, boolean ois) {
            this.call = call; this.manager = manager; this.id = id;
            this.width = width; this.height = height; this.fps = fps;
            this.choice = choice; this.eis = eis; this.preview = preview; this.ois = ois;
        }

        void start() throws CameraAccessException {
            worker = new HandlerThread("multicam-stabilization-probe");
            worker.start();
            handler = new Handler(worker.getLooper());
            reader = ImageReader.newInstance(width, height, ImageFormat.YUV_420_888, 2);
            reader.setOnImageAvailableListener(images -> {
                Image frame = null;
                try { frame = images.acquireLatestImage(); } catch (Exception ignored) { }
                finally { if (frame != null) frame.close(); }
            }, handler);
            handler.postDelayed(() -> finish("unknown", "Не получено достаточного подтверждения CaptureResult за 7 секунд"), 7000);
            manager.openCamera(id, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice opened) {
                    if (finished.get()) { opened.close(); return; }
                    device = opened;
                    try {
                        device.createCaptureSession(Collections.singletonList(reader.getSurface()),
                            new CameraCaptureSession.StateCallback() {
                                @Override public void onConfigured(CameraCaptureSession configured) {
                                    if (finished.get()) { configured.close(); return; }
                                    session = configured;
                                    try {
                                        CaptureRequest.Builder request = device.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);
                                        request.addTarget(reader.getSurface());
                                        if ("eis".equals(choice) || "preview-stabilization".equals(choice)) {
                                            request.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                                                "eis".equals(choice) ? CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON :
                                                    CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_PREVIEW_STABILIZATION);
                                            if (ois) request.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                                                CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_OFF);
                                        } else if ("ois".equals(choice)) {
                                            request.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                                                CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON);
                                            if (eis || preview) request.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                                                CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_OFF);
                                        }
                                        configured.setRepeatingRequest(request.build(), new CameraCaptureSession.CaptureCallback() {
                                            @Override public void onCaptureCompleted(CameraCaptureSession s, CaptureRequest r, TotalCaptureResult result) {
                                                if (finished.get()) return;
                                                frames++;
                                                Integer actualEis = result.get(CaptureResult.CONTROL_VIDEO_STABILIZATION_MODE);
                                                Integer actualOis = result.get(CaptureResult.LENS_OPTICAL_STABILIZATION_MODE);
                                                if (actualEis != null) { lastEis = actualEis; hasResults = true; }
                                                if (actualOis != null) { lastOis = actualOis; hasResults = true; }
                                                boolean matches = "eis".equals(choice) ?
                                                    actualEis != null && actualEis == CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_ON :
                                                    "preview-stabilization".equals(choice) ?
                                                        actualEis != null && actualEis == CameraMetadata.CONTROL_VIDEO_STABILIZATION_MODE_PREVIEW_STABILIZATION :
                                                        actualOis != null && actualOis == CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON;
                                                if (matches) confirmed++;
                                                if (confirmed >= 3) finish("capture-result-confirmed",
                                                    "Camera2 подтвердил выбранный режим на нескольких кадрах; запись и качество стабилизации не проверены");
                                                else if (frames >= 12) finish(hasResults ? "not-confirmed" : "unknown",
                                                    "Режим не подтверждён текущим CaptureResult; функция не объявляется отсутствующей");
                                            }
                                        }, handler);
                                    } catch (Exception e) { fail("Не удалось применить стабилизацию: " + e.getMessage()); }
                                }
                                @Override public void onConfigureFailed(CameraCaptureSession s) {
                                    fail("Camera2 отклонила тестовую YUV-сессию");
                                }
                            }, handler);
                    } catch (Exception e) { fail("Не удалось создать Camera2-сессию: " + e.getMessage()); }
                }
                @Override public void onDisconnected(CameraDevice d) { fail("Камера отключилась во время проверки"); }
                @Override public void onError(CameraDevice d, int error) { fail("Ошибка Camera2: " + error); }
            }, handler);
        }

        void finish(String state, String message) {
            if (!finished.compareAndSet(false, true)) return;
            JSObject obj = base(id, width, height, fps, choice, eis, preview, ois);
            obj.put("state", state); obj.put("message", message);
            obj.put("framesObserved", frames);
            obj.put("confirmations", confirmed);
            obj.put("captureResultEis", lastEis < 0 ? JSObject.NULL : lastEis);
            obj.put("captureResultOis", lastOis < 0 ? JSObject.NULL : lastOis);
            cleanup();
            call.resolve(obj);
        }
        void fail(String message) {
            if (!finished.compareAndSet(false, true)) return;
            cleanup();
            call.reject(message);
        }
        void cleanup() {
            try { if (session != null) session.close(); } catch (Exception ignored) { }
            try { if (device != null) device.close(); } catch (Exception ignored) { }
            try { if (reader != null) reader.close(); } catch (Exception ignored) { }
            if (worker != null) worker.quitSafely();
            if (active == this) active = null;
            occupied.set(false);
        }
    }
}
