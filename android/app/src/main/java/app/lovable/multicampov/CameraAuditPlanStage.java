package app.lovable.multicampov;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;

/**
 * A resumable declaration-only plan for later functional camera tests.
 * Does not open cameras, codecs, microphones or recording sessions.
 */
final class CameraAuditPlanStage {
    private static final int MAX_PLANS_PER_CAMERA = 8;
    private static final int PLAN_VERSION = 1;
    private static final int[] PREFERRED_FPS = {30,60,24,120};
    private CameraAuditPlanStage() { }

    static void run(Context context) {
        JSONObject passport = CameraAuditService.read(context);
        if (!"complete".equals(passport.optString("state")) ||
                !"complete".equals(passport.optString("codecState")) ||
                "complete".equals(passport.optString("planState"))) return;
        try {
            JSONObject cameras = passport.optJSONObject("cameras");
            JSONArray ids = passport.optJSONArray("activeCameraIds");
            if (cameras == null || ids == null) throw new IllegalStateException("missing-camera-ids");
            passport.put("planState", "running");
            passport.put("planTotal", ids.length());
            passport.put("planCompleted", 0);
            passport.put("planCandidateCount", 0);
            CameraAuditService.persist(context, passport);
            int completed = 0, candidates = 0;
            for (int i=0;i<ids.length();i++) {
                String pressure = CameraAuditResourceGuard.pauseReason(context);
                if (pressure != null) {
                    passport.put("planState","retry");
                    passport.put("planError",pressure);
                    passport.put("updatedAt",System.currentTimeMillis());
                    CameraAuditService.persist(context,passport);
                    return;
                }
                String cameraId = ids.optString(i,"");
                JSONObject camera = cameras.optJSONObject(cameraId);
                if (camera == null || !"complete".equals(camera.optString("codecState"))) {
                    passport.put("planState","retry");
                    passport.put("planError","incomplete-camera-declarations");
                    CameraAuditService.persist(context,passport);
                    return;
                }
                if (!"complete".equals(camera.optString("planState")) ||
                        camera.optInt("planVersion",0) != PLAN_VERSION) {
                    JSONArray planned = buildPlan(cameraId,camera.optJSONArray("codecChecks"));
                    camera.put("functionalPlan",planned);
                    camera.put("planEvidence","declared-compatible-only");
                    camera.put("planVersion",PLAN_VERSION);
                    camera.put("planState","complete");
                    camera.put("planCheckedAt",System.currentTimeMillis());
                }
                JSONArray plan = camera.optJSONArray("functionalPlan");
                candidates += plan == null ? 0 : plan.length();
                completed++;
                passport.put("planCompleted",completed);
                passport.put("planCandidateCount",candidates);
                passport.put("updatedAt",System.currentTimeMillis());
                // Every completed camera survives process termination.
                CameraAuditService.persist(context,passport);
                if (Thread.currentThread().isInterrupted()) return;
            }
            passport.put("planState","complete");
            passport.put("planCompleted",completed);
            passport.remove("planError");
            passport.put("updatedAt",System.currentTimeMillis());
            CameraAuditService.persist(context,passport);
        } catch (Exception error) {
            try {
                passport.put("planState","retry");
                passport.put("planError",error.getClass().getSimpleName());
                passport.put("updatedAt",System.currentTimeMillis());
                CameraAuditService.persist(context,passport);
            } catch (Exception ignored) { }
        }
    }

    private static JSONArray buildPlan(String cameraId,JSONArray declarations) throws Exception {
        JSONArray plan = new JSONArray();
        if (declarations == null) return plan;
        Set<String> seen = new HashSet<>();
        for (int fps : PREFERRED_FPS) {
            for (int i=0;i<declarations.length();i++) {
                JSONObject check = declarations.optJSONObject(i);
                if (check == null || check.optInt("fpsRequested") != fps ||
                        !"declared-compatible".equals(check.optString("status"))) continue;
                int width = check.optInt("width"),height = check.optInt("height");
                if (width<1 || height<1) continue;
                JSONArray encoders = check.optJSONArray("encoders");
                JSONObject encoder = encoders == null ? null : encoders.optJSONObject(0);
                if (encoder == null || !encoder.optBoolean("declaredOnly") ||
                        encoder.optString("name").isEmpty() || encoder.optString("mime").isEmpty()) continue;
                String key=cameraId+"|"+width+"|"+height+"|"+fps;
                if (!seen.add(key)) continue;
                JSONObject item=new JSONObject();
                item.put("key",key);
                item.put("cameraId",cameraId);
                item.put("width",width);
                item.put("height",height);
                item.put("fps",fps);
                item.put("encoderName",encoder.optString("name"));
                item.put("encoderMime",encoder.optString("mime"));
                item.put("evidence","declared-compatible-only");
                item.put("status","not-run");
                item.put("verifiedRecording",false);
                plan.put(item);
                if (plan.length()>=MAX_PLANS_PER_CAMERA) return plan;
            }
        }
        return plan;
    }
}
