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
    private static final long WEBVIEW_THRESHOLD_MS = 12000L;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final AtomicLong lastHeartbeat = new AtomicLong();
    private static final AtomicLong webViewHeartbeat = new AtomicLong();
    private static final AtomicBoolean receivedJsHeartbeat = new AtomicBoolean();
    private static volatile String lastJsAction = "Android activity created";
    private static volatile long lastJsActionAt = 0L;
    private static final AtomicBoolean webViewCaptured = new AtomicBoolean();
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
        webViewHeartbeat.set(SystemClock.uptimeMillis());
        receivedJsHeartbeat.set(false);
        lastJsAction = "Android activity created; waiting for WebView";
        lastJsActionAt = SystemClock.uptimeMillis();
        webViewCaptured.set(false);
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
        final long now = SystemClock.uptimeMillis();
        lastHeartbeat.set(now);
        // A WebView paused by Android is not evidence of a JS loop freeze.
        // The first JavaScript pulse may never arrive if startup is frozen.
        // Start a watchdog even before React has mounted.
        webViewHeartbeat.set(now);
        webViewCaptured.set(false);
        pendingPulse.set(false);
        captured.set(false);
    }

    /** Called only by the running React JS loop. Native UI and JS renderer
     * are separate processes; a healthy Android main thread does not prove
     * the app's WebView is still processing touches and effects. */
    public static void webViewPulse() {
        receivedJsHeartbeat.set(true);
        webViewHeartbeat.set(SystemClock.uptimeMillis());
        webViewCaptured.set(false);
    }

    /** A lightweight diagnostic breadcrumb, kept in memory until a freeze is
     * detected. No disk I/O and no camera changes on the Android UI thread. */
    public static void traceAction(String action) {
        if (action == null || action.isEmpty()) return;
        lastJsAction = action.replace('\n', ' ').replace('\r', ' ')
            .substring(0, Math.min(96, action.length()));
        lastJsActionAt = SystemClock.uptimeMillis();
    }

    private static String actionContext(long now) {
        return " Last action: " + lastJsAction +
            "; action age: " + Math.max(0L, now - lastJsActionAt) + " ms.";
    }

    private static void persistReport(String report) {
        Context ctx = context;
        if (ctx == null) return;
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(REPORT, report.length() > 4096 ? report.substring(0, 4096) : report)
            .putLong(RECORDED_AT, System.currentTimeMillis())
            .commit();
        Log.e("MultiCamUiFreeze", report);
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
            if (blockedFor < ANR_THRESHOLD_MS) {
                final long webLast = webViewHeartbeat.get();
                final long webDelay = webLast == 0L ? 0L : now - webLast;
                if (webDelay >= WEBVIEW_THRESHOLD_MS &&
                    webViewCaptured.compareAndSet(false, true)) {
                    persistReport("MULTI-CAM POV: " +
                        (receivedJsHeartbeat.get() ? "WebView JavaScript heartbeat missing for " :
                         "First WebView JavaScript heartbeat never arrived after ") +
                        webDelay + " ms while Android main thread remains responsive. " +
                        "Possible stalled startup, WebView renderer, JavaScript loop, or " +
                        "JS-to-native bridge; this is NOT proof of a specific cause." +
                        actionContext(now) + " Capture logcat for more detail.");
                }
                return;
            }
            if (!captured.compareAndSet(false, true)) return;
            StackTraceElement[] stack = Looper.getMainLooper().getThread().getStackTrace();
            StringBuilder details = new StringBuilder();
            details.append("MULTI-CAM POV: Android UI thread blocked for ")
                .append(blockedFor).append(" ms")
                .append(actionContext(now));
            int limit = Math.min(stack.length, 28);
            for (int i = 0; i < limit; i++) {
                details.append("\n").append(stack[i].toString());
            }
            // SharedPreferences persistence is done on the worker, never UI.
            persistReport(details.toString());
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
