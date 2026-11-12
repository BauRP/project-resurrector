package app.lovable.multicampov;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.WebView;
import java.lang.ref.WeakReference;

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
    private static final long EARLY_WEBVIEW_THRESHOLD_MS = 7500L;
    private static final Handler MAIN = new Handler(Looper.getMainLooper());
    private static final AtomicLong lastHeartbeat = new AtomicLong();
    private static final AtomicLong webViewHeartbeat = new AtomicLong();
    private static final AtomicBoolean receivedJsHeartbeat = new AtomicBoolean();
    private static volatile String lastJsAction = "Android activity created";
    private static volatile long lastJsActionAt = 0L;
    private static final AtomicBoolean webViewCaptured = new AtomicBoolean();
    private static final AtomicBoolean earlyWebViewCaptured = new AtomicBoolean();
    private static final AtomicBoolean pendingPulse = new AtomicBoolean();
    private static final AtomicBoolean captured = new AtomicBoolean();
    private static volatile boolean foreground = false;
    // Bridge callbacks and WebView JavaScript can stall independently.
    private static volatile WeakReference<WebView> observedWebView = new WeakReference<>(null);
    private static final AtomicBoolean rendererProbePending = new AtomicBoolean();
    private static final AtomicLong rendererProbeSentAt = new AtomicLong();
    private static final AtomicLong rendererRepliedAt = new AtomicLong();
    // A hung evaluateJavascript callback previously kept this pending forever.
    // Bound one probe to six seconds and invalidate any late callback before
    // retrying, so the monitor can recover its independent evidence.
    private static final long RENDERER_PROBE_TIMEOUT_MS = 6000L;
    private static final long RENDERER_PROBE_RETRY_MS = 9000L;
    private static final AtomicLong rendererProbeGeneration = new AtomicLong();
    private static final AtomicLong monitorEpoch = new AtomicLong();
    private static final AtomicBoolean rendererUnresponsiveRecorded = new AtomicBoolean();
    private static volatile String rendererLastEvidence = "";
    private static ScheduledExecutorService worker;
    private static Context context;
    private static volatile java.lang.ref.WeakReference<Runnable> webViewRecoveryListener =
        new java.lang.ref.WeakReference<>(null);
    private static volatile java.lang.ref.WeakReference<Runnable> webViewResponsiveListener =
        new java.lang.ref.WeakReference<>(null);

    /** Runs only when native MAIN is alive but Chromium JS is nonresponsive. */
    public static void setWebViewRecoveryListener(Runnable listener) {
        webViewRecoveryListener = new java.lang.ref.WeakReference<>(listener);
    }
    public static void setWebViewResponsiveListener(Runnable listener) {
        webViewResponsiveListener = new java.lang.ref.WeakReference<>(listener);
    }
    public static boolean javascriptRespondedRecently() {
        final long last = webViewHeartbeat.get();
        return last > 0L && SystemClock.uptimeMillis() - last < 2200L;
    }


    private UiFreezeMonitor() {}

    public static synchronized void start(Context applicationContext, WebView webView) {
        stop();
        context = applicationContext.getApplicationContext();
        observedWebView = new WeakReference<>(webView);
        rendererProbeGeneration.incrementAndGet();
        rendererProbePending.set(false);
        rendererProbeSentAt.set(0L);
        rendererRepliedAt.set(0L);
        rendererLastEvidence = "";
        rendererUnresponsiveRecorded.set(false);
        monitorEpoch.incrementAndGet();
        lastHeartbeat.set(SystemClock.uptimeMillis());
        webViewHeartbeat.set(SystemClock.uptimeMillis());
        receivedJsHeartbeat.set(false);
        lastJsAction = "Android activity created; waiting for WebView";
        lastJsActionAt = SystemClock.uptimeMillis();
        webViewCaptured.set(false);
        earlyWebViewCaptured.set(false);
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

    /** Android 10+ can report that the Chromium renderer itself stopped
     * responding. Observe only: never kill WebView or discard unsaved video. */
    public static void recordRendererUnresponsive() {
        if (!foreground || !rendererUnresponsiveRecorded.compareAndSet(false, true)) return;
        ScheduledExecutorService executor = worker;
        if (executor == null || executor.isShutdown()) return;
        try {
            executor.execute(() -> persistReport(
                "MULTI-CAM POV: Android WebView renderer reported UNRESPONSIVE. " +
                "This is a renderer stall, not merely a delayed Capacitor callback. " +
                "Last renderer evidence: " + rendererLastEvidence +
                actionContext(SystemClock.uptimeMillis()) +
                " Capture renderer trace and logcat for the blocking operation."
            ));
        } catch (java.util.concurrent.RejectedExecutionException ignored) {
            // Activity is closing: diagnostics must never interfere with it.
        }
    }

    public static void recordRendererGone(boolean crashed) {
        ScheduledExecutorService executor = worker;
        if (executor == null || executor.isShutdown()) return;
        try {
            executor.execute(() -> persistReport("MULTI-CAM POV: WebView renderer " +
                (crashed ? "CRASHED" : "WAS KILLED BY ANDROID") +
                ". Camera2 foreground service not automatically stopped. " +
                actionContext(SystemClock.uptimeMillis())));
        } catch (java.util.concurrent.RejectedExecutionException ignored) { }
    }

    public static void recordManualRecovery() {
        // Do not overwrite the actual ANR/renderer trace with a trivial
        // "user restarted" entry: the next launch must show the real cause.
        Log.i("MultiCamUiFreeze", "Manual recovery requested; previous report retained.");
    }

    public static void recordRendererResponsive() {
        rendererUnresponsiveRecorded.set(false);
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
        earlyWebViewCaptured.set(false);
        pendingPulse.set(false);
        captured.set(false);
        rendererProbeGeneration.incrementAndGet();
        rendererProbePending.set(false);
        rendererProbeSentAt.set(0L);
        rendererRepliedAt.set(0L);
        rendererUnresponsiveRecorded.set(false);
    }

    /** Called only by the running React JS loop. Native UI and JS renderer
     * are separate processes; a healthy Android main thread does not prove
     * the app's WebView is still processing touches and effects. */
    public static void webViewPulse() {
        receivedJsHeartbeat.set(true);
        webViewHeartbeat.set(SystemClock.uptimeMillis());
        final boolean wasUnresponsive = webViewCaptured.getAndSet(false) ||
            rendererUnresponsiveRecorded.getAndSet(false);
        earlyWebViewCaptured.set(false);
        // Once the actual JS loop resumes, dismiss a stale *native* modal.
        // Do not delete the diagnostic report; a dead renderer still requires
        // the user to restart the UI manually.
        if (wasUnresponsive) {
            final Runnable listener = webViewResponsiveListener.get();
            if (listener != null) MAIN.post(() -> {
                if (foreground) listener.run();
            });
        }
    }

    /** A lightweight diagnostic breadcrumb, kept in memory until a freeze is
     * detected. No disk I/O and no camera changes on the Android UI thread. */
    public static void traceAction(String action) {
        if (action == null || action.isEmpty()) return;
        lastJsAction = action.replace('\n', ' ').replace('\r', ' ')
            .substring(0, Math.min(96, action.length()));
        lastJsActionAt = SystemClock.uptimeMillis();
    }

    /** System-level context for differentiating Chromium/OOM/GPU stalls.
     * All system-service queries run on the independent monitor thread.
     * Never include camera media, clip names, device identifiers or user data.
     */
    private static String environmentEvidence() {
        StringBuilder info = new StringBuilder();
        try {
            Context app = context;
            android.app.ActivityManager manager = app == null ? null :
                (android.app.ActivityManager) app.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager != null) {
                android.app.ActivityManager.MemoryInfo memory =
                    new android.app.ActivityManager.MemoryInfo();
                manager.getMemoryInfo(memory);
                info.append(" Android free RAM MB: ")
                    .append(memory.availMem / 1048576L)
                    .append("; low memory: ").append(memory.lowMemory).append('.');
            }
            Runtime runtime = Runtime.getRuntime();
            info.append(" Java heap used/max MB: ")
                .append((runtime.totalMemory() - runtime.freeMemory()) / 1048576L)
                .append('/').append(runtime.maxMemory() / 1048576L).append('.');
            info.append(" Android API: ")
                .append(android.os.Build.VERSION.SDK_INT).append('.');
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                android.content.pm.PackageInfo webView =
                    android.webkit.WebView.getCurrentWebViewPackage();
                if (webView != null) info.append(" WebView provider: ")
                    .append(webView.packageName)
                    .append("; WebView: ")
                    .append(webView.versionName == null ? "unknown" : webView.versionName).append('.');
            }
        } catch (RuntimeException error) {
            Log.w("MultiCamUiFreeze", "Environment evidence unavailable", error);
        }
        return info.toString();
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

    private static void checkRendererIndependently(long now) {
        if (observedWebView.get() == null) return;
        final long sent = rendererProbeSentAt.get();
        if (rendererProbePending.get()) {
            // An unresponsive Chromium renderer may never invoke the Java
            // callback. Do not let that one lost callback disable diagnostics
            // for every later Settings/Camera navigation in this Activity.
            if (sent > 0L && now - sent >= RENDERER_PROBE_TIMEOUT_MS &&
                rendererProbePending.compareAndSet(true, false)) {
                rendererProbeGeneration.incrementAndGet();
                rendererLastEvidence = "Independent WebView JavaScript probe timed out after " +
                    (now - sent) + " ms; renderer callback not delivered.";
                rendererProbeSentAt.set(now); // back off: never flood UI thread
            }
            return;
        }
        if (sent > 0L && now - sent < RENDERER_PROBE_RETRY_MS) return;
        if (!rendererProbePending.compareAndSet(false, true)) return;
        rendererProbeSentAt.set(now);
        final long epoch = monitorEpoch.get();
        final long generation = rendererProbeGeneration.incrementAndGet();
        MAIN.post(() -> {
            if (!foreground || epoch != monitorEpoch.get() ||
                generation != rendererProbeGeneration.get()) {
                if (generation == rendererProbeGeneration.get()) rendererProbePending.set(false);
                return;
            }
            WebView webView = observedWebView.get();
            if (webView == null) {
                if (generation == rendererProbeGeneration.get()) rendererProbePending.set(false);
                return;
            }
            try {
                // Static expression bypasses the Capacitor plugin queue.
                // Read only in-memory navigation breadcrumbs. This is a pure
                // expression, not a bridge call, permission prompt or camera task.
                webView.evaluateJavascript(
                    "(function(){return 'tab='+String(document.documentElement.dataset.activeMulticamTab||'unknown')+'; action='+String(window.__multicamFreezeLastAction||'unknown').slice(0,96)})()",
                    value -> {
                        if (epoch == monitorEpoch.get() && generation == rendererProbeGeneration.get()) {
                            rendererLastEvidence = value == null ? "" :
                                value.substring(0, Math.min(240, value.length()));
                            rendererRepliedAt.set(SystemClock.uptimeMillis());
                            rendererProbePending.set(false);
                        }
                    });
            } catch (RuntimeException error) {
                if (generation == rendererProbeGeneration.get()) rendererProbePending.set(false);
                Log.w("MultiCamUiFreeze", "Independent renderer probe unavailable", error);
            }
        });
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
                if (webDelay >= 4500L) checkRendererIndependently(now);
                // The instrumented test has a 12s JavaScript callback budget.
                // Persist evidence earlier or the test may close the Activity
                // before the regular 12s watchdog gets to sample the freeze.
                // Never show a dialog or restart/stop camera during this stage.
                if (webDelay >= EARLY_WEBVIEW_THRESHOLD_MS &&
                    earlyWebViewCaptured.compareAndSet(false, true)) {
                    boolean rendererProbeAnswered = rendererRepliedAt.get() > 0L &&
                        now - rendererRepliedAt.get() <= 4500L;
                    persistReport("MULTI-CAM POV: Early WebView responsiveness warning after " +
                        webDelay + " ms; Android MAIN alive. Independent renderer callback " +
                        (rendererProbeAnswered ? "responded" : "has not replied recently") +
                        ". Last renderer evidence: " + rendererLastEvidence +
                        actionContext(now) + environmentEvidence() +
                        " No app functions or camera operation were stopped.");
                }
                if (webDelay >= WEBVIEW_THRESHOLD_MS &&
                    webViewCaptured.compareAndSet(false, true)) {
                    boolean independentRendererResponsive =
                        rendererRepliedAt.get() > 0L &&
                        now - rendererRepliedAt.get() <= 4500L;
                    String diagnosis = observedWebView.get() == null
                        ? "Independent WebView probe was unavailable."
                        : independentRendererResponsive
                            ? "Independent WebView JavaScript evaluation responded recently; the Capacitor bridge / plugin callback queue may be blocked."
                            : "Independent WebView JavaScript probe did not respond recently; investigate event loop, renderer, or compositor.";
                    // A JS-frozen WebView cannot render its own error notice.
                    // Present a native dialog while Android MAIN is responsive.
                    final Runnable recovery = webViewRecoveryListener.get();
                    // A healthy independent JS probe means the renderer is
                    // alive and only the Capacitor bridge may be delayed.
                    // Persist evidence but don't cover working buttons with
                    // a false native "WebView frozen" dialog.
                    if (recovery != null &&
                        (!independentRendererResponsive || rendererUnresponsiveRecorded.get()))
                        MAIN.post(() -> { if (foreground) recovery.run(); });
                    persistReport("MULTI-CAM POV: " +
                        (rendererUnresponsiveRecorded.get()
                            ? "Android reported WebView RENDERER UNRESPONSIVE. " : "") +
                        (receivedJsHeartbeat.get() ? "WebView bridge heartbeat missing for " :
                         "First WebView bridge heartbeat never arrived after ") +
                        webDelay + " ms while Android main thread remains responsive. " +
                        diagnosis + " Independent renderer evidence: " +
                        rendererLastEvidence + ". This report does not identify a confirmed culprit." +
                        actionContext(now) + environmentEvidence() +
                        " Capture logcat for more detail.");
                }
                return;
            }
            if (!captured.compareAndSet(false, true)) return;
            StackTraceElement[] stack = Looper.getMainLooper().getThread().getStackTrace();
            StringBuilder details = new StringBuilder();
            details.append("MULTI-CAM POV: Android UI thread blocked for ")
                .append(blockedFor).append(" ms")
                .append(actionContext(now)).append(environmentEvidence());
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
        monitorEpoch.incrementAndGet();
        rendererProbeGeneration.incrementAndGet();
        rendererProbePending.set(false);
        observedWebView.clear();
        if (worker != null) {
            // Let an already queued crash report reach SharedPreferences.
            // The periodic monitor is disabled by foreground=false above.
            worker.shutdown();
            worker = null;
        }
    }
}
