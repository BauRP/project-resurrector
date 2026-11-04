package app.lovable.multicampov;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Captures an actual blocked Android UI thread stack instead of guessing
 * which camera or WebView feature froze. Does not stop, disable or alter any
 * application feature. Uses an independent daemon thread.
 */
public final class UiFreezeMonitor {
    static final String PREFS = "multicam_ui_freeze_report";
    static final String REPORT = "lastReport";
    static final String RECORDED_AT = "recordedAt";
    private static final long ANR_THRESHOLD_MS = 6500L;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final AtomicLong lastHeartbeat = new AtomicLong();
    private static final AtomicBoolean pendingPulse = new AtomicBoolean();
    private static final AtomicBoolean captured = new AtomicBoolean();
    private static volatile boolean foreground = false;
    private static ScheduledExecutorService worker;
    private static Context context;

    private UiFreezeMonitor() {}

    public static synchronized void start(Context applicationContext) {
        stop();
        context = applicationContext.getApplicationContext();
        lastHeartbeat.set(SystemClock.uptimeMillis());
        pendingPulse.set(false);
        captured.set(false);
        foreground = true;
        worker = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread thread = new Thread(r, "multicam-ui-freeze-monitor");
            thread.setDaemon(true);
            return thread;
        });
        worker.scheduleWithFixedDelay(UiFreezeMonitor::check, 1500, 1500, TimeUnit.MILLISECONDS);
    }

    public static void setForeground(boolean visible) {
        foreground = visible;
        lastHeartbeat.set(SystemClock.uptimeMillis());
        pendingPulse.set(false);
        captured.set(false);
    }

    private static void check() {
        if (!foreground) return;
        try {
            long now = SystemClock.uptimeMillis();
            if (pendingPulse.compareAndSet(false, true)) {
                MAIN.post(() -> {
                    lastHeartbeat.set(SystemClock.uptimeMillis());
                    pendingPulse.set(false);
                    captured.set(false);
                });
            }
            long blockedFor = now - lastHeartbeat.get();
            if (blockedFor < ANR_THRESHOLD_MS || !captured.compareAndSet(false, true)) return;
            StackTraceElement[] stack = Looper.getMainLooper().getThread().getStackTrace();
            StringBuilder details = new StringBuilder();
            details.append("MULTI-CAM POV: Android UI thread blocked for ")
                .append(blockedFor).append(" ms");
            int limit = Math.min(stack.length, 28);
            for (int i = 0; i < limit; i++) {
                details.append("\n").append(stack[i].toString());
            }
            String report = details.length() > 4096 ? details.substring(0, 4096) : details.toString();
            Context ctx = context;
            if (ctx != null) {
                // Write on the monitor thread, never the blocked UI thread.
                ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(REPORT, report)
                    .putLong(RECORDED_AT, System.currentTimeMillis())
                    .commit();
            }
            Log.e("MultiCamUiFreeze", report);
        } catch (Exception e) {
            Log.w("MultiCamUiFreeze", "Failed to capture UI stall", e);
        }
    }

    public static synchronized void stop() {
        foreground = false;
        if (worker != null) {
            worker.shutdownNow();
            worker = null;
        }
    }
}
