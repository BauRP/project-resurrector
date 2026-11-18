package app.lovable.multicampov;

import android.Manifest;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.IBinder;
import android.util.AtomicFile;
import android.util.Range;
import android.util.Size;

import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Separate Android process for the first-install, read-only Camera2 inventory.
 *
 * This does NOT open CameraDevice, MediaRecorder, microphone or any video stream.
 * The result is a metadata checkpoint, not proof that recording modes work.
 * Each finished camera is committed through AtomicFile before moving on.
 * A killed process can resume remaining entries at the next app launch.
 */
public final class CameraAuditService extends Service {
    public static final String FILE_NAME = "multicam-first-run-audit-v1.json";
    private static final int SCHEMA = 1;
    private final AtomicBoolean started = new AtomicBoolean(false);

    public static JSONObject read(Context context) {
        AtomicFile file = new AtomicFile(new File(context.getFilesDir(), FILE_NAME));
        if (!file.getBaseFile().exists()) return blank();
        try (InputStream in = file.openRead()) {
            byte[] data = new byte[256 * 1024];
            int length = 0;
            while (length < data.length) {
                int n = in.read(data, length, data.length - length);
                if (n < 0) break;
                length += n;
            }
            if (length == data.length) return blank();
            JSONObject saved = new JSONObject(new String(data, 0, length, StandardCharsets.UTF_8));
            return saved.optInt("schema") == SCHEMA ? saved : blank();
        } catch (Exception ignored) {
            return blank(); // A corrupt checkpoint is never a successful scan.
        }
    }

    private static JSONObject blank() {
        JSONObject result = new JSONObject();
        try {
            result.put("schema", SCHEMA);
            result.put("state", "not-started");
            result.put("completed", 0);
            result.put("total", 0);
            result.put("cameras", new JSONObject());
            result.put("advancedState", "pending");
        } catch (Exception ignored) { }
        return result;
    }

    private static void persist(Context context, JSONObject value) throws Exception {
        AtomicFile file = new AtomicFile(new File(context.getFilesDir(), FILE_NAME));
        FileOutputStream out = null;
        try {
            out = file.startWrite();
            byte[] data = value.toString().getBytes(StandardCharsets.UTF_8);
            out.write(data);
            out.flush();
            file.finishWrite(out);
        } catch (Exception error) {
            if (out != null) file.failWrite(out);
            throw error;
        }
    }

    public static boolean inventoryComplete(Context context) {
        return "complete".equals(read(context).optString("state"));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (!started.compareAndSet(false, true)) return START_NOT_STICKY;
        Thread worker = new Thread(() -> {
            try {
                inventory();
            } finally {
                started.set(false);
                stopSelf(startId);
            }
        }, "multicam-camera-inventory-worker");
        worker.setPriority(Thread.MIN_PRIORITY);
        worker.start();
        return START_NOT_STICKY;
    }

    private void inventory() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) return;
        JSONObject saved = read(this);
        if ("complete".equals(saved.optString("state"))) return;
        try {
            CameraManager manager = (CameraManager) getSystemService(Context.CAMERA_SERVICE);
            if (manager == null) throw new IllegalStateException("CameraManager unavailable");
            String[] ids = manager.getCameraIdList();
            JSONObject cameraResults = saved.optJSONObject("cameras");
            if (cameraResults == null) cameraResults = new JSONObject();

            saved.put("state", "running");
            saved.put("total", ids.length);
            saved.put("androidSdk", Build.VERSION.SDK_INT);
            saved.put("startedAt", saved.optLong("startedAt", System.currentTimeMillis()));
            saved.put("updatedAt", System.currentTimeMillis());
            saved.put("cameras", cameraResults);
            persist(this, saved);

            int completed = 0;
            for (String id : ids) {
                if (!cameraResults.has(id)) {
                    JSONObject item = new JSONObject();
                    item.put("cameraId", id);
                    item.put("source", "android-camera2-metadata");
                    item.put("verifiedRecording", false);
                    try {
                        CameraCharacteristics c = manager.getCameraCharacteristics(id);
                        Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                        item.put("facing", facing == null ? "unknown" :
                                facing == CameraCharacteristics.LENS_FACING_FRONT ? "front" :
                                facing == CameraCharacteristics.LENS_FACING_BACK ? "back" : "external");
                        item.put("hardwareLevel", optional(c.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL)));
                        item.put("sensorOrientation", optional(c.get(CameraCharacteristics.SENSOR_ORIENTATION)));
                        item.put("flash", Boolean.TRUE.equals(c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE)));
                        item.put("manualSensor", contains(
                                c.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES),
                                CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR));
                        item.put("rawDeclared", contains(
                                c.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES),
                                CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES_RAW));
                        Float focus = c.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
                        item.put("minimumFocusDistance", optional(focus));
                        Float digitalZoom = c.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM);
                        item.put("maximumDigitalZoom", optional(digitalZoom));
                        Range<Integer> iso = c.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
                        item.put("isoRange", iso == null ? JSONObject.NULL :
                                new JSONArray().put(iso.getLower()).put(iso.getUpper()));
                        Range<Long> shutter = c.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
                        item.put("exposureTimeNs", shutter == null ? JSONObject.NULL :
                                new JSONArray().put(shutter.getLower()).put(shutter.getUpper()));
                        float[] focal = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS);
                        JSONArray focalLengths = new JSONArray();
                        if (focal != null) for (float f : focal) focalLengths.put(f);
                        item.put("focalLengthsMm", focalLengths);
                        JSONArray physical = new JSONArray();
                        if (Build.VERSION.SDK_INT >= 28) {
                            for (String physicalId : c.getPhysicalCameraIds()) physical.put(physicalId);
                        }
                        item.put("physicalCameraIds", physical);
                        item.put("oisModes", integers(c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION)));
                        item.put("eisModes", integers(c.get(CameraCharacteristics.CONTROL_AVAILABLE_VIDEO_STABILIZATION_MODES)));
                        JSONArray sizes = new JSONArray();
                        StreamConfigurationMap map = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
                        if (map != null) {
                            Size[] outputSizes = map.getOutputSizes(MediaRecorder.class);
                            if (outputSizes != null) {
                                for (Size size : outputSizes) {
                                    sizes.put(new JSONObject().put("width", size.getWidth())
                                            .put("height", size.getHeight()));
                                }
                            }
                        }
                        item.put("videoOutputSizesDeclared", sizes);
                        item.put("state", "metadata-collected");
                    } catch (Exception error) {
                        item.put("state", "unavailable");
                        item.put("reason", error.getClass().getSimpleName());
                    }
                    cameraResults.put(id, item);
                }
                completed++;
                saved.put("completed", completed);
                saved.put("updatedAt", System.currentTimeMillis());
                persist(this, saved);
                if (Thread.currentThread().isInterrupted()) return;
            }
            saved.put("state", "complete");
            saved.put("completed", ids.length);
            saved.put("finishedAt", System.currentTimeMillis());
            saved.put("updatedAt", System.currentTimeMillis());
            persist(this, saved);
        } catch (Exception error) {
            try {
                saved.put("state", "retry");
                saved.put("error", error.getClass().getSimpleName());
                saved.put("updatedAt", System.currentTimeMillis());
                persist(this, saved);
            } catch (Exception ignored) { }
        }
    }

    private static Object optional(Object value) { return value == null ? JSONObject.NULL : value; }
    private static JSONArray integers(int[] values) {
        JSONArray array = new JSONArray();
        if (values != null) for (int value : values) array.put(value);
        return array;
    }
    private static boolean contains(int[] values, int wanted) {
        if (values == null) return false;
        for (int value : values) if (value == wanted) return true;
        return false;
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
