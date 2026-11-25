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
    private static final String MODE_ENTRIES="mode_entries_v2";
    private static final int MAX_MODE_ENTRIES=128;
    private static final Object LOCK=new Object();
    private NativeCaptureAuditStore(){}

    // Independent mode evidence survives rotation of the 24-session history.
    private static boolean sameMode(JSONObject a,JSONObject b) {
        return a.optString("cameraId","").equals(b.optString("cameraId","")) &&
            a.optInt("width",-1)==b.optInt("width",-2) &&
            a.optInt("height",-1)==b.optInt("height",-2) &&
            a.optInt("fps",-1)==b.optInt("fps",-2);
    }
    private static boolean eligibleMode(JSONObject item) {
        return item!=null && item.optInt("evidenceVersion",0)==2 &&
            "saved".equals(item.optString("state")) && !item.optString("cameraId","").isEmpty() &&
            item.optInt("width",0)>0 && item.optInt("height",0)>0 && item.optInt("fps",0)>0 &&
            item.optLong("savedBytes",0)>=1024 && item.optBoolean("mp4TracksInspected") &&
            item.optBoolean("mp4HasVideoTrack") && item.optBoolean("mp4FirstFrameDecodable");
    }
    private static JSONArray updateModeEntries(SharedPreferences p,JSONArray recent,JSONObject item) {
        JSONArray old;
        try{old=new JSONArray(p.getString(MODE_ENTRIES,"[]"));}
        catch(Exception ignored){old=new JSONArray();}
        if(!p.contains(MODE_ENTRIES))old=recent;
        JSONArray rows=new JSONArray();
        try {
            for(int i=0;i<old.length();i++){
                JSONObject prior=old.optJSONObject(i);
                if(!eligibleMode(prior)||(eligibleMode(item)&&sameMode(prior,item)))continue;
                JSONObject clean=new JSONObject(prior.toString());
                clean.remove("message");clean.remove("savedUri");
                rows.put(clean);
            }
            if(eligibleMode(item)){
                JSONObject clean=new JSONObject(item.toString());
                clean.remove("message");clean.remove("savedUri");
                rows.put(clean);
            }
        }catch(Exception ignored){return old;}
        JSONArray result=new JSONArray();
        for(int i=Math.max(0,rows.length()-MAX_MODE_ENTRIES);i<rows.length();i++)
            result.put(rows.optJSONObject(i));
        return result;
    }

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
                String[] strings={"state","cameraId","message","stabilization","savedUri",
                    "mp4TimelineLimitReason","mp4AudioTimelineLimitReason"};
                for(String k:strings)item.put(k,status.optString(k,""));
                String[] longs={"captureId","startedAt","recordedDurationMs","savedBytes",
                    "lastFoldAt","maxFoldNearbyCallbackGapMs","mp4DurationMs","mp4MaxFoldPtsGapMs",
                    "mp4AvTailOffsetMs","mp4MaxFoldAudioPtsGapMs",
                    "mp4TimelineMaxGapMs","mp4AudioTimelineMaxGapMs","mp4AvDriftMs",
                    "maxCameraCallbackSilenceMs"};
                for(String k:longs)item.put(k,status.optLong(k,0L));
                String[] integers={"width","height","fps","mp4VideoWidth","mp4VideoHeight",
                    "mp4VideoSamples","mp4VideoTimestampRollbacks","mp4VideoTimestampDuplicates","mp4TailVideoSamples","mp4AudioSamples","mp4TailAudioSamples","mp4AudioPtsAnomalies","mp4MiddleProbes","mp4MiddleMatched",
                    "mp4FoldProbes","mp4FoldMatched","mp4FoldPointsSkipped",
                    "foldObservations","foldPostureChanges","foldGeometryOnlyChanges",
                    "foldCheckpointsOmitted","foldChangesWhilePaused",
                    "foldNearbyCallbackGaps","mp4FoldPtsSpanChecks","mp4FoldPtsLargeGaps",
                    "mp4FoldAudioPtsSpanChecks","mp4FoldAudioPtsLargeGaps",
                    "recordingEisFrames","recordingOisFrames",
                    "recordingStabilizationOffFrames","recordingStabilizationUnknownFrames",
                    "mp4TimelineSamples","mp4TimelineRollbacks","mp4TimelineDuplicates",
                    "mp4TimelineLargeGaps","mp4LowFpsWindows","cameraCaptureFailureEvents",
                    "foldNearbyCaptureFailureEvents","sensorTimestampMissingEvents",
                    "foldNearbyMissingSensorTimestamps","sensorTimestampDiscontinuities","sensorTimestampRollbacks","cameraCallbackStallEpisodes",
                    "mp4AudioTimelineSamples",
                    "mp4AudioTimelineRollbacks","mp4AudioTimelineDuplicates",
                    "mp4AudioTimelineLargeGaps"};
                for(String k:integers)item.put(k,status.optInt(k,0));
                String[] booleans={"diagnosticClip","audioRequested","mp4TracksInspected","mp4HasVideoTrack",
                    "mp4HasAudioTrack","mp4FirstFrameDecodable","mp4TailFrameDecodable","mp4TailNearEnd","mp4VideoSampleLimitReached",
                    "mp4CheckpointAuditCompleted","foldObserverGap",
                    "mp4TailAudioNearEnd","mp4AvTailOffsetMeasured",
                    "mp4TimelineCompleted","mp4AudioTimelineCompleted",
                    "mp4AudioTimelineTrackFound","mp4AvDriftMeasured"};
                for(String k:booleans)item.put(k,status.optBoolean(k,false));
                double measuredFps=status.optDouble("mp4TimelineSampledFps",-1d);
                item.put("mp4TimelineSampledFps",Double.isFinite(measuredFps) && measuredFps>0d && measuredFps<=240d ? measuredFps:-1d);
                // Preserve measured timing from the actual finalized capture.
                // Unknown numeric values remain -1, never a guessed FPS.
                for(String k:new String[]{"mp4SampledFps","mp4TailSampledFps"}) {
                    double value=status.optDouble(k,-1d);
                    item.put(k,Double.isFinite(value)&&value>0d&&value<=240d?value:-1d);
                }
                item.put("evidenceVersion",2);
                item.put("savedAt",System.currentTimeMillis());
            }catch(Exception ignored){return;}
            rows.put(item);
            JSONArray retained=new JSONArray();
            int skip=Math.max(0,rows.length()-MAX_ENTRIES);
            for(int i=skip;i<rows.length();i++)retained.put(rows.optJSONObject(i));
            // Synchronous commit prevents a process killed directly after
            // finalization from losing this metadata (the MP4 stays separate).
            JSONArray modeEntries=updateModeEntries(p,old,item);
            p.edit().putString(ENTRIES,retained.toString())
                .putString(MODE_ENTRIES,modeEntries.toString())
                .putInt(OMITTED,omitted+skip).commit();
        }
    }
    public static JSObject history(Context context) {
        synchronized(LOCK) {
            SharedPreferences p=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);
            JSObject result=new JSObject();
            try{result.put("entries",new JSONArray(p.getString(ENTRIES,"[]")));}
            catch(Exception ignored){result.put("entries",new JSONArray());}
            try{result.put("modeEntries",new JSONArray(p.getString(MODE_ENTRIES,"[]")));}
            catch(Exception ignored){result.put("modeEntries",new JSONArray());}
            result.put("omittedEarlier",p.getInt(OMITTED,0));
            result.put("maxEntries",MAX_ENTRIES);
            return result;
        }
    }
}
