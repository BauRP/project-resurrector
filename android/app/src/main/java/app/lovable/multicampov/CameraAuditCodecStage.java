package app.lovable.multicampov;

import android.content.Context;
import android.media.MediaCodecInfo;
import android.media.MediaCodecList;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import java.util.List;

/**
 * Declared encoder compatibility scan, performed by CameraAuditService in
 * its own low-priority Android process. No codec is instantiated, no camera
 * is opened, no media is created. Results are CANDIDATES, never recordings.
 * Every finished camera's results are atomically committed.
 */
final class CameraAuditCodecStage {
    // One migration pass repairs old passports whose summary counters were
    // complete but whose per-camera JSON was truncated or never written.
    static final int INTEGRITY_VERSION = 1;
    private static final int MAX_SIZES_PER_CAMERA = 6;
    private static final int MAX_ENCODER_MATCHES = 4;
    private static final int[] FPS = {24, 30, 60, 120};
    private static final String[] VIDEO_MIMES = {
        "video/avc", "video/hevc", "video/x-vnd.on2.vp9", "video/av01"
    };
    private CameraAuditCodecStage() { }

    static void run(Context context) {
        JSONObject passport = CameraAuditService.read(context);
        if (!"complete".equals(passport.optString("state"))) return;
        // Recover a contradictory completed checkpoint without deleting
        // finished per-camera work.
        if ("complete".equals(passport.optString("codecState")) &&
                passport.optInt("codecCompleted", -1) == passport.optInt("codecTotal", -2) &&
                passport.optInt("codecTotal", -1) == passport.optInt("total", -2) &&
                passport.optInt("codecIntegrityVersion", 0) == INTEGRITY_VERSION) return;
        try {
            JSONObject cameras = passport.optJSONObject("cameras");
            JSONArray ids = passport.optJSONArray("activeCameraIds");
            if (cameras == null) throw new IllegalStateException("Missing camera inventory");
            if (ids == null) {
                // Upgrade an existing successful first-run passport without
                // repeating its Camera2 metadata probes after an app update.
                ids = new JSONArray();
                java.util.Iterator<String> keys = cameras.keys();
                while (keys.hasNext()) ids.put(keys.next());
                passport.put("activeCameraIds", ids);
                CameraAuditService.persist(context, passport);
            }
            // A device in thermal/memory distress must not start expensive
            // codec metadata enumeration. Completed lens work stays on disk.
            String pressureBefore = CameraAuditResourceGuard.pauseReason(context);
            if (pressureBefore != null) {
                passport.put("codecState", "retry");
                passport.put("codecError", pressureBefore);
                CameraAuditService.persist(context, passport);
                return;
            }
            // MediaCodecList is queried exactly once, never per lens/mode.
            MediaCodecInfo[] codecs = new MediaCodecList(MediaCodecList.REGULAR_CODECS).getCodecInfos();
            // Preload vendor codec capabilities once per job, not repeatedly
            // for each Camera2 resolution and FPS combination.
            EncoderCatalog catalog = collectEncoderCapabilities(codecs);
            int completed = 0;
            passport.put("codecTotal", ids.length());
            passport.put("codecState", "running");
            passport.remove("codecIntegrityVersion");
            CameraAuditService.persist(context, passport);
            for (int i=0; i<ids.length(); i++) {
                String pressure = CameraAuditResourceGuard.pauseReason(context);
                if (pressure != null) {
                    passport.put("codecState", "retry");
                    passport.put("codecError", pressure);
                    passport.put("updatedAt", System.currentTimeMillis());
                    CameraAuditService.persist(context, passport);
                    return;
                }
                String cameraId = ids.optString(i, "");
                if (cameraId.isEmpty()) continue;
                JSONObject camera = cameras.optJSONObject(cameraId);
                if (camera == null || !"metadata-collected".equals(camera.optString("state"))) continue;
                // A camera marked complete without actual encoded-mode
                // declarations is not a valid checkpoint. Repair ONLY it,
                // preserving all other completed lenses.
                if (!"complete".equals(camera.optString("codecState")) ||
                        camera.optJSONArray("codecChecks") == null ||
                        camera.optLong("codecCheckedAt", 0) <= 0) {
                    JSONArray checks = scanCamera(camera, catalog);
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
            if (completed == ids.length()) {
                passport.remove("codecError");
                passport.put("codecIntegrityVersion", INTEGRITY_VERSION);
            }
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

    private static final class EncoderProfile {
        final String name;
        final String mime;
        final MediaCodecInfo.VideoCapabilities video;
        EncoderProfile(String name, String mime, MediaCodecInfo.VideoCapabilities video) {
            this.name = name;
            this.mime = mime;
            this.video = video;
        }
    }
    private static final class EncoderCatalog {
        final List<EncoderProfile> profiles = new ArrayList<>();
        boolean unknown;
    }
    private static EncoderCatalog collectEncoderCapabilities(MediaCodecInfo[] codecs) {
        EncoderCatalog result = new EncoderCatalog();
        for (MediaCodecInfo info : codecs) {
            try {
                if (!info.isEncoder()) continue;
                for (String mime : VIDEO_MIMES) {
                    try {
                        if (!supportsType(info, mime)) continue;
                        MediaCodecInfo.CodecCapabilities caps = info.getCapabilitiesForType(mime);
                        MediaCodecInfo.VideoCapabilities video = caps.getVideoCapabilities();
                        if (video == null) {
                            result.unknown = true;
                        } else {
                            result.profiles.add(new EncoderProfile(info.getName(), mime, video));
                        }
                    } catch (RuntimeException brokenVendorCodec) {
                        result.unknown = true;
                    }
                }
            } catch (RuntimeException brokenVendorCodec) {
                result.unknown = true;
            }
        }
        return result;
    }

    private static JSONArray scanCamera(JSONObject camera, EncoderCatalog catalog) throws Exception {
        JSONArray checks = new JSONArray();
        JSONArray sizes = camera.optJSONArray("videoModeCandidatesDeclared");
        if (sizes == null) return checks;
        // Prioritize 1080p, 4K and 720p when the actual Camera2 HAL reports
        // them. Vendor HAL ordering must not cause these common modes to be
        // omitted by our six-size cost limit. No unreported mode is invented.
        ArrayList<JSONObject> candidates = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < sizes.length(); i++) {
            JSONObject mode = sizes.optJSONObject(i);
            if (mode == null) continue;
            int width = mode.optInt("width"), height = mode.optInt("height");
            if (width < 1 || height < 1 || width > 8192 || height > 8192) continue;
            if (seen.add(width + "x" + height)) candidates.add(mode);
        }
        candidates.sort((a,b) -> Integer.compare(modePriority(a), modePriority(b)));
        for (int i = 0; i < candidates.size() && i < MAX_SIZES_PER_CAMERA; i++) {
            JSONObject mode = candidates.get(i);
            int width = mode.optInt("width"), height = mode.optInt("height");
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
                boolean unknown = catalog.unknown;
                for (EncoderProfile profile : catalog.profiles) {
                    try {
                        if (profile.video.areSizeAndRateSupported(width, height, fps)) {
                            JSONObject entry = new JSONObject();
                            entry.put("name", profile.name);
                            entry.put("mime", profile.mime);
                            entry.put("declaredOnly", true);
                            if (matched.length() < MAX_ENCODER_MATCHES) matched.put(entry);
                        }
                    } catch (RuntimeException brokenVendorCodec) {
                        unknown = true; // unknown != unsupported
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

    private static int modePriority(JSONObject mode) {
        int width = mode.optInt("width");
        int height = mode.optInt("height");
        int small = Math.min(width, height), large = Math.max(width, height);
        if (small == 1080 && large == 1920) return 0;
        if (small == 2160 && large == 3840) return 1;
        if (small == 720 && large == 1280) return 2;
        return 3;
    }

    private static boolean supportsType(MediaCodecInfo info, String mime) {
        for (String type : info.getSupportedTypes()) if (type.equalsIgnoreCase(mime)) return true;
        return false;
    }
}
