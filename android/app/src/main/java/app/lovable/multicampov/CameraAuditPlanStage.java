package app.lovable.multicampov;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.HashSet;
import java.util.Set;
import java.util.ArrayList;

/**
 * A resumable declaration-only plan for later functional camera tests.
 * Does not open cameras, codecs, microphones or recording sessions.
 */
final class CameraAuditPlanStage {
    static final int MAX_PLANS_PER_CAMERA = 8;
    static final int VERSION = 2;
    private static final int PLAN_VERSION = VERSION;
    private static final int[] PREFERRED_FPS = {30,60,24,120};
    private CameraAuditPlanStage() { }

    static void run(Context context) {
        JSONObject passport = CameraAuditService.read(context);
        if (!CameraAuditService.completeCodecRows(passport) ||
                !"complete".equals(passport.optString("codecState")) ||
                passport.optInt("codecIntegrityVersion", 0) !=
                    CameraAuditCodecStage.INTEGRITY_VERSION) return;
        if ("complete".equals(passport.optString("planState")) &&
                passport.optInt("planVersion", 0) == PLAN_VERSION &&
                passport.optInt("planCompleted", -1) == passport.optInt("planTotal", -2) &&
                passport.optInt("planTotal", -1) == passport.optInt("total", -2) &&
                CameraAuditService.completePlanRows(passport)) return;
        try {
            JSONObject cameras = passport.optJSONObject("cameras");
            JSONArray ids = passport.optJSONArray("activeCameraIds");
            if (cameras == null || ids == null) throw new IllegalStateException("missing-camera-ids");
            // Count durable valid rows before checking resource pressure:
            // resume never visibly drops to zero or repeats finished lenses.
            int completed = 0, candidates = 0;
            Set<String> completedIds = new HashSet<>();
            for (int i=0;i<ids.length();i++) {
                String id = ids.optString(i,"");
                JSONObject camera = cameras.optJSONObject(id);
                if (CameraAuditService.completePlanRow(camera)) {
                    completedIds.add(id);
                    completed++;
                    candidates += camera.optJSONArray("functionalPlan").length();
                }
            }
            passport.put("planState", "running");
            passport.put("planTotal", ids.length());
            passport.put("planCompleted", completed);
            passport.put("planCandidateCount", candidates);
            passport.remove("planError");
            passport.put("updatedAt", System.currentTimeMillis());
            CameraAuditService.persist(context, passport);
            for (int i=0;i<ids.length();i++) {
                if (Thread.currentThread().isInterrupted()) return;
                if (completedIds.contains(ids.optString(i,""))) continue;
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
                if (camera == null || !"complete".equals(camera.optString("codecState")) ||
                        camera.optJSONArray("codecChecks") == null ||
                        camera.optLong("codecCheckedAt", 0) <= 0) {
                    passport.put("planState","retry");
                    passport.put("planError","incomplete-camera-declarations");
                    CameraAuditService.persist(context,passport);
                    return;
                }
                // A new codec scan invalidates previously planned modes.
                // Never silently reuse camera-specific test candidates from
                // a previous encoder snapshot, even if that plan said complete.
                if (!"complete".equals(camera.optString("planState")) ||
                        camera.optInt("planVersion",0) != PLAN_VERSION ||
                        camera.optLong("planCodecCheckedAt",-1) !=
                            camera.optLong("codecCheckedAt",-2) ||
                        !CameraAuditService.completePlanRow(camera)) {
                    JSONArray planned = buildPlan(cameraId,camera.optJSONArray("codecChecks"));
                    camera.put("functionalPlan",planned);
                    camera.put("planCodecCheckedAt",camera.optLong("codecCheckedAt",-2));
                    camera.put("planEvidence","declared-compatible-only");
                    JSONObject pipeline = new JSONObject();
                    // The whole chain is recorded per camera so later true
                    // Preview/Encoder/File/Editor/Export tests can add proof,
                    // without turning declarations into fake successes.
                    pipeline.put("sensor","metadata-only");
                    pipeline.put("preview","not-run");
                    pipeline.put("encoder",planned.length() > 0 ? "candidate-only" : "unknown");
                    pipeline.put("file","not-run");
                    pipeline.put("editor","not-run");
                    pipeline.put("export","not-run");
                    camera.put("functionalPipeline",pipeline);
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
            passport.put("planVersion", PLAN_VERSION);
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
        // Camera2 vendor ordering must not fill the entire eight-entry plan
        // with obscure resolutions at 30fps, starving declared 60fps modes.
        ArrayList<JSONObject> ranked = new ArrayList<>();
        for (int i=0;i<declarations.length();i++) {
            JSONObject check = declarations.optJSONObject(i);
            if (check != null && "declared-compatible".equals(check.optString("status")))
                ranked.add(check);
        }
        ranked.sort((a,b) -> Integer.compare(candidatePriority(a),candidatePriority(b)));
        for (JSONObject check : ranked) {
                int fps = check.optInt("fpsRequested");
                if (fpsRank(fps) >= PREFERRED_FPS.length) continue;
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
        return plan;
    }

    private static int fpsRank(int fps) {
        for (int i=0;i<PREFERRED_FPS.length;i++) if (PREFERRED_FPS[i] == fps) return i;
        return PREFERRED_FPS.length;
    }
    private static int resolutionRank(JSONObject mode) {
        int width=mode.optInt("width"),height=mode.optInt("height");
        int a=Math.min(width,height),b=Math.max(width,height);
        if (a==1080 && b==1920) return 0;
        if (a==2160 && b==3840) return 1;
        if (a==720 && b==1280) return 2;
        return 3;
    }
    private static int candidatePriority(JSONObject mode) {
        int rank=resolutionRank(mode),fps=fpsRank(mode.optInt("fpsRequested"));
        // Try 1080p/4K/720p at 30/60/24/120 before less common modes,
        // all taken only from actual Camera2 and MediaCodec declarations.
        return rank < 3 ? fps*3+rank : 20+fps;
    }
}
