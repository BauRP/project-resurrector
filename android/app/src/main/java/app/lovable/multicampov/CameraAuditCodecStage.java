package app.lovable.multicampov;

import android.content.Context;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/**
 * Declared encoder compatibility scan, performed by CameraAuditService in
 * its own low-priority Android process. No codec is instantiated, no camera
 * is opened, no media is created. Results are CANDIDATES, never recordings.
 * Every finished camera's results are atomically committed.
 */
final class CameraAuditCodecStage {
    private static final int MAX_SIZES_PER_CAMERA = 12;
    private static final int[] FPS = {24, 30, 60, 120};
    private static final String[] VIDEO_MIMES = {
        "video/avc", "video/hevc", "video/x-vnd.on2.vp9", "video/av01"
    };
    private CameraAuditCodecStage() { }

    static void run(Context context) {
        JSONObject passport = CameraAuditService.read(context);
        if (!"complete".equals(passport.optString("state")) ||
                "complete".equals(passport.optString("codecState"))) return;
        try {
            JSONObject cameras = passport.optJSONObject("cameras");
            JSONArray ids = passport.optJSONArray("activeCameraIds");
            if (cameras == null || ids == null) throw new IllegalStateException("Missing camera inventory");
            // MediaCodecList is queried exactly once, never per lens/mode.
            MediaCodecInfo[] codecs = new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos();
            int completed = 0;
            passport.put("codecTotal", ids.length());
            passport.put("codecState", "running");
            CameraAuditService.persist(context, passport);
            for (int i=0; i<ids.length(); i++) {
                String cameraId = ids.optString(i, "");
                if (cameraId.isEmpty()) continue;
                JSONObject camera = cameras.optJSONObject(cameraId);
                if (camera == null || !"metadata-collected".equals(camera.optString("state"))) continue;
                if (!"complete".equals(camera.optString("codecState"))) {
                    JSONArray checks = scanCamera(camera, codecs);
                    camera.put("codecChecks", checks);
                    camera.put("codecState", "complete");
                    camera.put("codecCheckedAt", System.currentTimeMillis());
                    camera.put("codecEvidence", "encoder-declarations-only");
                }
                completed++;
                passport.put("codecCompleted", completed);
                passport.put("updatedAt", System.currentTimeMillis());
                CameraAuditService.persist(context, passport);
                if (Thread.currentThread().isInterrupted()) return;
            }
            passport.put("codecState", completed == ids.length() ? "complete" : "retry");
            if (completed == ids.length()) passport.remove("codecError");
            CameraAuditService.persist(context, passport);
        } catch (Exception problem) {
            try {
                passport.put("codecState", "retry");
                passport.put("codecError", problem.getClass().getSimpleName());
                passport.put("updatedAt", System.currentTimeMillis());
                CameraAuditService.persist(context, passport);
            } catch (Exception ignored) { }
        }
    }

    private static JSONArray scanCamera(JSONObject camera, MediaCodecInfo[] codecs) throws Exception {
        JSONArray checks = new JSONArray();
        JSONArray sizes = camera.optJSONArray("videoModeCandidatesDeclared");
        if (sizes == null) return checks;
        // Do not enumerate a Cartesian explosion on a low-end device. Prefer
        // each distinct declared resolution in the original HAL order.
        int examined = 0;
        for (int i=0; i<sizes.length() && examined<MAX_SIZES_PER_CAMERA; i++) {
            JSONObject mode = sizes.optJSONObject(i);
            if (mode == null) continue;
            int width = mode.optInt("width"), height = mode.optInt("height");
            if (width<1 || height<1 || width>8192 || height>8192) continue;
            examined++;
            double upper = mode.optDouble("theoreticalUpperFps", -1);
            for (int fps : FPS) {
                JSONObject check = new JSONObject();
                check.put("width", width);
                check.put("height", height);
                check.put("fpsRequested", fps);
                check.put("recordedAndVerified", false);
                check.put("cameraFpsKnown", upper > 0);
                // Minimum frame duration is a HAL declaration; it is NOT
                // proof of real sensor output or encoded file timing.
                if (upper > 0 && upper + 0.001 < fps) {
                    check.put("status", "not-declared-by-camera");
                    check.put("encoders", new JSONArray());
                    checks.put(check);
                    continue;
                }
                JSONArray matched = new JSONArray();
                boolean unknown = false;
                for (MediaCodecInfo info : codecs) {
                    if (!info.isEncoder()) continue;
                    for (String mime : VIDEO_MIMES) {
                        try {
                            if (!supportsType(info,mime)) continue;
                            MediaCodecInfo.CodecCapabilities caps = info.getCapabilitiesForType(mime);
                            MediaCodecInfo.VideoCapabilities video = caps.getVideoCapabilities();
                            if (video == null) { unknown = true; continue; }
                            if (video.areSizeAndRateSupported(width,height,fps)) {
                                JSONObject entry = new JSONObject();
                                entry.put("name", info.getName());
                                entry.put("mime", mime);
                                entry.put("declaredOnly", true);
                                matched.put(entry);
                            }
                        } catch (RuntimeException brokenVendorCodec) {
                            unknown = true; // unknown != unsupported
                        }
                    }
                }
                check.put("encoders", matched);
                check.put("status", matched.length()>0 ? "declared-compatible" :
                        unknown ? "unknown" : "not-declared-by-encoder");
                checks.put(check);
            }
        }
        return checks;
    }

    private static boolean supportsType(MediaCodecInfo info, String mime) {
        for (String type : info.getSupportedTypes()) if (type.equalsIgnoreCase(mime)) return true;
        return false;
    }
}
