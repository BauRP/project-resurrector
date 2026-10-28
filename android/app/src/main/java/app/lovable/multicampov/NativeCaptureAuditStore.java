package app.lovable.multicampov;

import android.content.Context;
import android.content.SharedPreferences;

import com.getcapacitor.JSObject;
import org.json.JSONArray;
import org.json.JSONObject;

/** Durable, bounded Camera2 session evidence (never camera data or raw frames).
 * Each entry is a finalized native capture ATTEMPT, not a certification that
 * every MP4 frame survived. Kept outside the Activity/WebView lifecycle.
 */
public final class NativeCaptureAuditStore {
    private static final String PREFS="native_capture_audit_v1";
    private static final String ENTRIES="entries";
    private static final String OMITTED="omitted";
    private static final int MAX_ENTRIES=24;
    private static final Object LOCK=new Object();
    private NativeCaptureAuditStore(){}

    public static void append(Context context, JSObject status) {
        if(context==null||status==null)return;
        String state=status.optString("state","");
        if(!("saved".equals(state)||"saved_interrupted".equals(state)||
            "interrupted".equals(state)||"error".equals(state)))return;
        long id=status.optLong("captureId",0L);
        if(id<=0L)return;
        synchronized(LOCK) {
            SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
            JSONArray old;
            try{old=new JSONArray(p.getString(ENTRIES,"[]"));}
            catch(Exception ignored){old=new JSONArray();}
            JSONArray rows=new JSONArray();
            int omitted=p.getInt(OMITTED,0);
            // An interrupted recovery may be retried; preserve only one
            // final result per generation/recording identity.
            for(int i=0;i<old.length();i++) {
                JSONObject prior=old.optJSONObject(i);
                if(prior!=null&&prior.optLong("captureId",-1L)!=id)rows.put(prior);
            }
            JSONObject item=new JSONObject();
            try {
                String[] strings={"state","cameraId","message","stabilization","savedUri"};
                for(String k:strings)item.put(k,status.optString(k,""));
                String[] longs={"captureId","startedAt","recordedDurationMs","savedBytes",
                    "lastFoldAt","maxFoldNearbyCallbackGapMs","mp4DurationMs","mp4MaxFoldPtsGapMs"};
                for(String k:longs)item.put(k,status.optLong(k,0L));
                String[] integers={"width","height","fps","mp4VideoWidth","mp4VideoHeight",
                    "mp4VideoSamples","mp4AudioSamples","mp4MiddleProbes","mp4MiddleMatched",
                    "mp4FoldProbes","mp4FoldMatched","mp4FoldPointsSkipped",
                    "foldObservations","foldPostureChanges","foldGeometryOnlyChanges",
                    "foldNearbyCallbackGaps","mp4FoldPtsSpanChecks","mp4FoldPtsLargeGaps",
                    "recordingEisFrames","recordingOisFrames",
                    "recordingStabilizationOffFrames","recordingStabilizationUnknownFrames"};
                for(String k:integers)item.put(k,status.optInt(k,0));
                String[] booleans={"audioRequested","mp4TracksInspected","mp4HasVideoTrack",
                    "mp4HasAudioTrack","mp4FirstFrameDecodable","mp4TailFrameDecodable",
                    "mp4CheckpointAuditCompleted"};
                for(String k:booleans)item.put(k,status.optBoolean(k,false));
                item.put("savedAt",System.currentTimeMillis());
            }catch(Exception ignored){return;}
            rows.put(item);
            JSONArray retained=new JSONArray();
            int skip=Math.max(0,rows.length()-MAX_ENTRIES);
            for(int i=skip;i<rows.length();i++)retained.put(rows.optJSONObject(i));
            // Synchronous commit prevents a process killed directly after
            // finalization from losing this metadata (the MP4 stays separate).
            p.edit().putString(ENTRIES,retained.toString())
                .putInt(OMITTED,omitted+skip).commit();
        }
    }
    public static JSObject history(Context context) {
        synchronized(LOCK) {
            SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
            JSObject result=new JSObject();
            try{result.put("entries",new JSONArray(p.getString(ENTRIES,"[]")));}
            catch(Exception ignored){result.put("entries",new JSONArray());}
            result.put("omittedEarlier",p.getInt(OMITTED,0));
            result.put("maxEntries",MAX_ENTRIES);
            return result;
        }
    }
}
