package app.lovable.multicampov;

import android.Manifest;
import android.graphics.ImageFormat;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.DngCreator;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Size;
import android.view.Surface;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.Collections;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * One-shot real RAW_SENSOR -> DngCreator capture. A camera advertising RAW
 * is not enough: the session, capture result, RAW image and DNG write must all
 * succeed before reporting a saved image.
 *
 * Deliberately independent from the WebView camera pipeline. Called from
 * camera diagnostics while ordinary recording is inactive.
 */
@CapacitorPlugin(name = "RawDng", permissions = {
    @Permission(alias = "camera", strings = {Manifest.permission.CAMERA})
})
public class RawDngPlugin extends Plugin {
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile RawSession session;

    @PluginMethod
    public void captureRaw(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermissionResult");
            return;
        }
        if (!busy.compareAndSet(false, true)) {
            call.reject("Другая RAW-съёмка ещё не закончена");
            return;
        }
        String id = call.getString("cameraId", "");
        if (id.isEmpty()) {
            busy.set(false);
            call.reject("Не выбран Camera2 ID");
            return;
        }
        try {
            CameraManager manager = (CameraManager) getContext().getSystemService(android.content.Context.CAMERA_SERVICE);
            if (manager == null) throw new IllegalStateException("CameraManager недоступен");
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
            int[] capabilities = characteristics.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
            boolean supportsRaw = false;
            if (capabilities != null)
                for (int c : capabilities)
                    if (c == CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_RAW) supportsRaw = true;
            if (!supportsRaw) throw new IllegalArgumentException("Эта камера не объявляет RAW_SENSOR");
            StreamConfigurationMap map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            Size[] rawSizes = map != null ? map.getOutputSizes(ImageFormat.RAW_SENSOR) : null;
            if (rawSizes == null || rawSizes.length == 0) throw new IllegalArgumentException("RAW_SENSOR выход не объявлен");
            // Largest *actually declared* RAW sensor size, not a fabricated resolution.
            Size selected = rawSizes[0];
            for (Size candidate : rawSizes)
                if ((long)candidate.getWidth() * candidate.getHeight() > (long)selected.getWidth() * selected.getHeight())
                    selected = candidate;
            File directory = getContext().getExternalFilesDir("raw");
            if (directory == null || (!directory.exists() && !directory.mkdirs()))
                throw new IOException("Каталог DNG недоступен");
            File file = new File(directory, "multicam-raw-" + System.currentTimeMillis() + ".dng");
            RawSession run = new RawSession(call, characteristics, selected, file);
            session = run;
            run.start(manager, id);
        } catch (Exception error) {
            busy.set(false);
            call.reject("RAW-съёмка недоступна: " + error.getMessage());
        }
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void cameraPermissionResult(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) captureRaw(call);
        else call.reject("Нет разрешения CAMERA для DNG");
    }

    @Override
    protected void handleOnDestroy() {
        RawSession active = session;
        if (active != null) active.fail("Сессия закрыта до сохранения DNG");
        super.handleOnDestroy();
    }

    private class RawSession {
        private final PluginCall call;
        private final CameraCharacteristics info;
        private final Size dimensions;
        private final File destination;
        private final AtomicBoolean completed = new AtomicBoolean(false);
        private HandlerThread worker;
        private Handler handler;
        private CameraDevice camera;
        private CameraCaptureSession captureSession;
        private ImageReader reader;
        private Image pendingImage;
        private TotalCaptureResult metadata;

        RawSession(PluginCall call, CameraCharacteristics info, Size dimensions, File destination) {
            this.call = call; this.info = info; this.dimensions = dimensions; this.destination = destination;
        }

        void start(CameraManager manager, String cameraId) throws CameraAccessException {
            worker = new HandlerThread("multicam-raw-dng");
            worker.start();
            handler = new Handler(worker.getLooper());
            reader = ImageReader.newInstance(dimensions.getWidth(), dimensions.getHeight(), ImageFormat.RAW_SENSOR, 2);
            reader.setOnImageAvailableListener(r -> {
                try {
                    Image fresh = r.acquireNextImage();
                    if (pendingImage != null) pendingImage.close();
                    pendingImage = fresh;
                    finishIfReady();
                } catch (Exception error) { fail("Не удалось получить RAW_IMAGE: " + error.getMessage()); }
            }, handler);
            handler.postDelayed(() -> fail("Истекло время ожидания RAW-кадра (15 секунд)"), 15000);
            manager.openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override public void onOpened(CameraDevice device) {
                    if (completed.get()) { device.close(); return; }
                    camera = device;
                    try {
                        Surface surface = reader.getSurface();
                        device.createCaptureSession(Collections.singletonList(surface), new CameraCaptureSession.StateCallback() {
                            @Override public void onConfigured(CameraCaptureSession configured) {
                                if (completed.get()) { configured.close(); return; }
                                captureSession = configured;
                                try {
                                    CaptureRequest.Builder request = device.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
                                    request.addTarget(surface);
                                    request.set(CaptureRequest.CONTROL_MODE, CameraMetadata.CONTROL_MODE_AUTO);
                                    configured.capture(request.build(), new CameraCaptureSession.CaptureCallback() {
                                        @Override public void onCaptureCompleted(CameraCaptureSession s, CaptureRequest request, TotalCaptureResult result) {
                                            metadata = result;
                                            finishIfReady();
                                        }
                                        @Override public void onCaptureFailed(CameraCaptureSession s, CaptureRequest request, android.hardware.camera2.CaptureFailure failure) {
                                            fail("Camera2 отказала в RAW-захвате: " + failure.getReason());
                                        }
                                    }, handler);
                                } catch (Exception error) { fail("Не удалось снять RAW: " + error.getMessage()); }
                            }
                            @Override public void onConfigureFailed(CameraCaptureSession s) {
                                fail("Сенсор отклонил RAW конфигурацию потоков");
                            }
                        }, handler);
                    } catch (Exception error) { fail("Не удалось открыть RAW-сессию: " + error.getMessage()); }
                }
                @Override public void onDisconnected(CameraDevice device) {
                    fail("Камера отключилась во время RAW-съёмки");
                }
                @Override public void onError(CameraDevice device, int code) {
                    fail("Ошибка Camera2 при RAW-съёмке: " + code);
                }
            }, handler);
        }

        private void finishIfReady() {
            if (pendingImage == null || metadata == null || completed.get()) return;
            try {
                Image image = pendingImage;
                pendingImage = null;
                try (DngCreator dng = new DngCreator(info, metadata);
                     FileOutputStream output = new FileOutputStream(destination)) {
                    dng.writeImage(output, image);
                    output.flush();
                    output.getFD().sync();
                } finally { image.close(); }
                if (!destination.isFile() || destination.length() < 4096)
                    throw new IOException("DNG пустой или не сохранён");
                if (!completed.compareAndSet(false, true)) return;
                JSObject result = new JSObject();
                result.put("cameraId", call.getString("cameraId", ""));
                result.put("width", dimensions.getWidth());
                result.put("height", dimensions.getHeight());
                result.put("bytes", destination.length());
                result.put("path", destination.getAbsolutePath());
                result.put("format", "image/x-adobe-dng");
                cleanup();
                call.resolve(result);
            } catch (Exception error) { fail("DNG не сохранён: " + error.getMessage()); }
        }

        void fail(String message) {
            if (!completed.compareAndSet(false, true)) return;
            if (destination.isFile()) destination.delete();
            cleanup();
            call.reject(message);
        }

        private void cleanup() {
            try { if (captureSession != null) captureSession.close(); } catch (Exception ignored) { }
            try { if (camera != null) camera.close(); } catch (Exception ignored) { }
            try { if (pendingImage != null) pendingImage.close(); } catch (Exception ignored) { }
            try { if (reader != null) reader.close(); } catch (Exception ignored) { }
            if (worker != null) worker.quitSafely();
            if (session == this) session = null;
            busy.set(false);
        }
    }
}
