package app.lovable.multicampov;

import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.os.SystemClock;
import java.io.File;

/**
 * Scans every EXPOSED video-sample presentation timestamp, when the MP4 is
 * short enough for a bounded inspection. Unlike a few head/tail checkpoints,
 * this can detect a large gap halfway through a recording.
 *
 * It never decodes video and cannot prove image continuity, exact FPS, audio
 * quality, or survival of a physical fold. A budget-exhausted scan is UNKNOWN.
 */
public final class NativeMp4TimelineAudit {
    private static final int MAX_SAMPLES = 120000;
    private static final long MAX_SCAN_MS = 4000L;

    public static final class Result {
        public int samples;
        public int rollbacks;
        public int duplicates;
        public int largeGaps;
        public long maximumGapMs;
        public boolean completed;
        public float approximateFps = -1f;
    }

    private NativeMp4TimelineAudit() {}

    public static Result inspect(File file, int requestedFps) {
        Result result = new Result();
        if (file == null || !file.isFile() || file.length() < 1024L) return result;
        MediaExtractor extractor = new MediaExtractor();
        try {
            extractor.setDataSource(file.getAbsolutePath());
            int videoTrack = -1;
            for (int i = 0; i < extractor.getTrackCount(); i++) {
                MediaFormat format = extractor.getTrackFormat(i);
                String mime = format.containsKey(MediaFormat.KEY_MIME)
                    ? format.getString(MediaFormat.KEY_MIME) : null;
                if (mime != null && mime.startsWith("video/")) {
                    videoTrack = i;
                    break;
                }
            }
            if (videoTrack < 0) return result;
            extractor.selectTrack(videoTrack);
            try {
                extractor.seekTo(0L, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                long first = -1L;
                long previous = -1L;
                // Conservative time discontinuity signal, not a declaration
                // that every gap is an encoder defect (VFR can be legitimate).
                long expectedPeriodUs = requestedFps > 0
                    ? 1000000L / requestedFps : 33333L;
                long largeGapUs = Math.max(500000L, expectedPeriodUs * 10L);
                long started = SystemClock.elapsedRealtime();
                boolean ended = false;
                while (result.samples < MAX_SAMPLES &&
                    SystemClock.elapsedRealtime() - started < MAX_SCAN_MS) {
                    long pts = extractor.getSampleTime();
                    if (pts < 0L) {
                        ended = true;
                        break;
                    }
                    if (first < 0L) first = pts;
                    if (previous >= 0L) {
                        if (pts < previous) result.rollbacks++;
                        else if (pts == previous) result.duplicates++;
                        else {
                            long delta = pts - previous;
                            result.maximumGapMs = Math.max(result.maximumGapMs, delta / 1000L);
                            if (delta > largeGapUs) result.largeGaps++;
                        }
                    }
                    previous = pts;
                    result.samples++;
                    if (!extractor.advance()) {
                        ended = true;
                        break;
                    }
                }
                // No claim of complete MP4 inspection if sample/time budget
                // is exhausted or the extractor fails part-way.
                result.completed = ended && result.samples >= 2;
                if (result.samples > 2 && previous > first &&
                    result.rollbacks == 0 && result.duplicates == 0) {
                    double fps = (result.samples - 1) * 1000000.0 / (previous - first);
                    if (Double.isFinite(fps) && fps > 0.0 && fps < 1000.0)
                        result.approximateFps = (float)fps;
                }
            } finally {
                extractor.unselectTrack(videoTrack);
            }
        } catch (Exception ignored) {
            result.completed = false;
        } finally {
            try { extractor.release(); } catch (Exception ignored) {}
        }
        return result;
    }
}
