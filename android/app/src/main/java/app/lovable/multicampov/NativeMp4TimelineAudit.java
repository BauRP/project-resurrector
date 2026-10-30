package app.lovable.multicampov;

import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.SystemClock;
import java.io.File;

/**
 * Bounded post-finalization walk of ACTUAL MP4 presentation timestamps.
 * Each track has its own extractor selection and time/sample budget so audio
 * cannot inherit the EOF cursor of an earlier video scan. A budget-exhausted
 * or broken scan is explicitly INCOMPLETE, never proof of good frames.
 *
 * Timestamp checks are not full-frame decoding, sound quality inspection,
 * objective stabilization measurement, or physical fold acceptance.
 */
public final class NativeMp4TimelineAudit {
    private static final int VIDEO_MAX_SAMPLES = 120000;
    private static final int AUDIO_MAX_SAMPLES = 180000;
    private static final long VIDEO_BUDGET_MS = 4000L;
    private static final long AUDIO_BUDGET_MS = 2000L;

    public static final class Result {
        public int samples, rollbacks, duplicates, largeGaps;
        public long maximumGapMs;
        public boolean completed;
        public float approximateFps = -1f;
        public boolean audioTrackFound;
        public int audioSamples, audioRollbacks, audioDuplicates, audioLargeGaps;
        public long audioMaximumGapMs;
        public boolean audioCompleted;
    }
    private static final class TrackScan {
        int samples, rollbacks, duplicates, largeGaps;
        long maximumGapMs;
        boolean completed;
        float approximateFps = -1f;
    }
    private NativeMp4TimelineAudit() {}

    private static TrackScan scanTrack(MediaExtractor extractor, int track,
        int maxSamples, long budgetMs, long longGapThresholdUs) {
        TrackScan scan = new TrackScan();
        extractor.selectTrack(track);
        try {
            extractor.seekTo(0L, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
            final long deadline = SystemClock.elapsedRealtime() + budgetMs;
            long first = -1L, previous = -1L;
            boolean ended = false;
            while (scan.samples < maxSamples &&
                SystemClock.elapsedRealtime() < deadline) {
                long pts = extractor.getSampleTime();
                if (pts < 0L) { ended = true; break; }
                if (first < 0L) first = pts;
                if (previous >= 0L) {
                    if (pts < previous) scan.rollbacks++;
                    else if (pts == previous) scan.duplicates++;
                    else {
                        long deltaUs = pts - previous;
                        scan.maximumGapMs = Math.max(scan.maximumGapMs,deltaUs / 1000L);
                        if (deltaUs > longGapThresholdUs) scan.largeGaps++;
                    }
                }
                previous = pts;
                scan.samples++;
                if (!extractor.advance()) { ended = true; break; }
            }
            scan.completed = ended && scan.samples >= 2;
            if (scan.samples > 2 && previous > first &&
                scan.rollbacks == 0 && scan.duplicates == 0) {
                double fps = (scan.samples - 1) * 1000000.0 / (previous - first);
                if (Double.isFinite(fps) && fps > 0.0 && fps < 1000.0)
                    scan.approximateFps = (float) fps;
            }
        } catch (Exception ignored) {
            // An exception after some samples invalidates a "full" claim.
            scan.completed = false;
        } finally {
            extractor.unselectTrack(track);
        }
        return scan;
    }

    public static Result inspect(File file, int requestedFps, boolean inspectAudio) {
        Result result = new Result();
        if (file == null || !file.isFile() || file.length() < 1024L) return result;
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(file.getAbsolutePath());
            int video = -1, audio = -1;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.containsKey(MediaFormat.KEY_MIME)
                    ? format.getString(MediaFormat.KEY_MIME) : null;
                if (video < 0 && mime != null && mime.startsWith("video/")) video = i;
                if (audio < 0 && mime != null && mime.startsWith("audio/")) audio = i;
            }
            result.audioTrackFound = audio >= 0;
            if (video >= 0) {
                long frameUs = requestedFps > 0
                    ? 1000000L / requestedFps : 33333L;
                TrackScan scanned = scanTrack(extractor, video,
                    VIDEO_MAX_SAMPLES, VIDEO_BUDGET_MS, Math.max(500000L, frameUs * 10L));
                result.samples = scanned.samples;
                result.rollbacks = scanned.rollbacks;
                result.duplicates = scanned.duplicates;
                result.largeGaps = scanned.largeGaps;
                result.maximumGapMs = scanned.maximumGapMs;
                result.completed = scanned.completed;
                result.approximateFps = scanned.approximateFps;
            }
            // A real video-only mode must not fail because no audio was requested.
            if (inspectAudio && audio >= 0) {
                TrackScan scanned = scanTrack(extractor, audio,
                    AUDIO_MAX_SAMPLES, AUDIO_BUDGET_MS, 500000L);
                result.audioSamples = scanned.samples;
                result.audioRollbacks = scanned.rollbacks;
                result.audioDuplicates = scanned.duplicates;
                result.audioLargeGaps = scanned.largeGaps;
                result.audioMaximumGapMs = scanned.maximumGapMs;
                result.audioCompleted = scanned.completed;
            }
        } catch (Exception ignored) {
            result.completed = false;
            result.audioCompleted = false;
        } finally {
            try { extractor.release(); } catch (Exception ignored) {}
        }
        return result;
    }
}
