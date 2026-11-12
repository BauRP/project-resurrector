package app.lovable.multicampov;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.os.Looper;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.*;

/**
 * Runs the real Capacitor WebView inside Android Emulator, not jsdom.
 * Tries the exact user path: Settings immediately, then Camera, Editor,
 * Transitions and Audio tabs. If Chromium locks up, the JS callback times out.
 * No camera recording or user media are created by the test.
 */
@RunWith(AndroidJUnit4.class)
@org.junit.FixMethodOrder(org.junit.runners.MethodSorters.NAME_ASCENDING)
public class MulticamFreezeNavigationInstrumentedTest {
    private static WebView findWebView(View node) {
        if (node instanceof WebView) return (WebView) node;
        if (node instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) node;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private static String eval(Activity activity, WebView view, String javascript) throws Exception {
        CountDownLatch reply = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        activity.runOnUiThread(() -> view.evaluateJavascript(javascript, value -> {
            result.set(value);
            reply.countDown();
        }));
        if (!reply.await(12, TimeUnit.SECONDS)) {
            // Android MAIN can be blocked inside HardwareRenderer while the
            // JS script itself never ran. A test-thread stack is useless:
            // capture MAIN and any RenderThread before assertion fails.
            StringBuilder evidence = new StringBuilder("WebView did not reply: ").append(javascript);
            Thread main = Looper.getMainLooper().getThread();
            evidence.append("\nAndroid MAIN [").append(main.getState()).append("]:");
            for (StackTraceElement frame : main.getStackTrace())
                evidence.append("\n  at ").append(frame);
            for (java.util.Map.Entry<Thread,StackTraceElement[]> thread :
                     Thread.getAllStackTraces().entrySet()) {
                if (!thread.getKey().getName().contains("RenderThread")) continue;
                evidence.append("\n").append(thread.getKey().getName())
                    .append(" [").append(thread.getKey().getState()).append("]:");
                for (StackTraceElement frame : thread.getValue())
                    evidence.append("\n  at ").append(frame);
            }
            // The native monitor runs independently of the hung Chromium
            // renderer. Include its last persisted snapshot, especially when
            // Android MAIN is idle while WebView JavaScript cannot reply.
            String monitorReport = activity.getSharedPreferences(
                UiFreezeMonitor.PREFS, Context.MODE_PRIVATE).getString(
                UiFreezeMonitor.REPORT, "");
            if (!monitorReport.isEmpty()) evidence.append("\nNative freeze watchdog:\n")
                .append(monitorReport);
            Log.e("MultiCamFreezeTest", evidence.toString());
            // Give the host capture watcher a short opportunity to collect
            // live Chromium renderer stacks before finally destroys WebView.
            Thread.sleep(9000);
            fail(evidence.toString());
        }
        return result.get();
    }

    /** Wait for actual Activity destruction so the next test never inherits
     * a Chromium renderer or GPU surface from the prior finished Activity.
     * Keep both real startup and navigation regression scenarios.
     */
    private static void finishAndWait(Activity activity) throws Exception {
        if (activity == null) return;
        InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
        long deadline = android.os.SystemClock.uptimeMillis() + 12000L;
        while (!activity.isDestroyed() &&
               android.os.SystemClock.uptimeMillis() < deadline) {
            Thread.sleep(100);
        }
        assertTrue("Activity failed to destroy its prior WebView", activity.isDestroyed());
        Thread.sleep(300);
    }

    private static void eventually(Activity activity, WebView view, String expression) throws Exception {
        Log.i("MultiCamFreezeTest", "Await: " + expression);
        long deadline = System.currentTimeMillis() + 12000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(eval(activity, view, expression))) return;
            Thread.sleep(180);
        }
        fail("WebView did not display " + expression);
    }

    private static void click(Activity activity, WebView view, String selector) throws Exception {
        Log.i("MultiCamFreezeTest", "Click: " + selector);
        String script = "(function(){var b=document.querySelector(" +
            org.json.JSONObject.quote(selector) +
            ");if(!b)return false;b.click();return true})()";
        assertEquals("true", eval(activity, view, script));
    }

    /**
     * True bare WebView baseline. Old test launched the FULL Capacitor/React
     * Activity BEFORE replacing its HTML, so a cold-start application freeze
     * looked like a clean WebView failure. This new debug-only Activity uses
     * no React, camera, background services or Capacitor plugins.
     */
    @Test
    public void aBaselineChromiumWithoutReactStillExecutesJavascript() throws Exception {
        Activity activity = null;
        try {
            Intent launch = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),
                MinimalWebViewActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
            assertNotNull(activity);
            Activity running = activity;
            AtomicReference<WebView> web = new AtomicReference<>();
            for (int attempt = 0; attempt < 60 && web.get() == null; attempt++) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    web.set(findWebView(running.getWindow().getDecorView())));
                if (web.get() == null) Thread.sleep(100);
            }
            WebView view = web.get();
            assertNotNull("Isolated plain Android WebView is missing", view);
            eventually(running, view, "!!document.querySelector('#baseline')");
            for (int i = 0; i < 5; i++) {
                Thread.sleep(300);
                assertEquals("true", eval(running, view,
                    "(function(){var v=document.querySelector('#status');" +
                    "if(!v)return false;v.textContent=String(Date.now());" +
                    "return !!document.querySelector('#baseline')})()"));
            }
        } finally {
            finishAndWait(activity);
        }
    }

    /**
     * The real app's single WebView is tested with just one screen replaced
     * by a tiny inert React shell during instrumentation. No production
     * feature is removed or disabled. This binary split isolates the freeze
     * to Settings mounting vs Camera teardown / global navigation.
     */
    private static void isolateThenNavigate(String isolation) throws Exception {
        Activity activity = null;
        try {
            Intent launch = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),
                MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
            assertNotNull(activity);
            Activity running = activity;
            AtomicReference<WebView> web = new AtomicReference<>();
            for (int attempt = 0; attempt < 60 && web.get() == null; attempt++) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    web.set(findWebView(running.getWindow().getDecorView())));
                if (web.get() == null) Thread.sleep(100);
            }
            WebView view = web.get();
            assertNotNull("Capacitor WebView is missing", view);
            eventually(running, view, "!!document.querySelector('.bottom-nav button:nth-child(3)')");
            assertEquals("true", eval(running, view,
                "(function(){document.documentElement.dataset.multicamFreezeIsolation=" +
                org.json.JSONObject.quote(isolation) + ";return true})()"));
            Log.i("MultiCamFreezeTest", "TEST-ONLY ISOLATION: " + isolation);
            if ("camera-shell".equals(isolation)) {
                // Mount the inert Camera shell before entering Settings.
                click(running, view, ".bottom-nav button:nth-child(2)");
                eventually(running, view, "!!document.querySelector('.editor-fold-workspace')");
                click(running, view, ".bottom-nav button:nth-child(1)");
                eventually(running, view, "!!document.querySelector('[data-freeze-isolation=camera-shell]')");
            }
            click(running, view, ".bottom-nav button:nth-child(3)");
            eventually(running, view, "!!document.querySelector('.settings-fold-workspace')");
            for (int i = 0; i < 3; i++) {
                Thread.sleep(350);
                assertEquals("true", eval(running, view,
                    "(function(){return document.documentElement.dataset.multicamFreezeIsolation===" +
                    org.json.JSONObject.quote(isolation) + "})()"));
            }
            click(running, view, ".bottom-nav button:nth-child(1)");
            eventually(running, view, "!!document.querySelector('.camera-screen')");
        } finally { finishAndWait(activity); }
    }

    @Test
    public void aDiagnosticSettingsLogicWithoutFullMarkup() throws Exception {
        isolateThenNavigate("settings-module");
    }

    @Test
    public void aDiagnosticSettingsTwoGroupsWithoutPortalsOrRadix() throws Exception {
        isolateThenNavigate("settings-groups");
    }

    @Test
    public void aDiagnosticIsolateSettingsMountFromCameraTeardown() throws Exception {
        isolateThenNavigate("settings-shell");
    }

    @Test
    public void aDiagnosticIsolateOutgoingCameraFromRealSettings() throws Exception {
        isolateThenNavigate("camera-shell");
    }

    /**
     * TEST ONLY diagnostic: the installed application is entirely unchanged.
     * Temporarily remove graphical paint effects from this test WebView
     * without disabling Camera, Editor, Settings, fold logic, or any handlers.
     * If this navigation passes but the unchanged design fails, isolate CSS
     * compositing costs instead of randomly changing camera ownership.
     */
    @Test
    public void aMinimalPaintDiagnosticStillNavigatesAllRealScreens() throws Exception {
        Activity activity = null;
        try {
            Intent launch = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),
                MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
            assertNotNull(activity);
            Activity running = activity;
            AtomicReference<WebView> web = new AtomicReference<>();
            for (int attempt = 0; attempt < 60 && web.get() == null; attempt++) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    web.set(findWebView(running.getWindow().getDecorView())));
                if (web.get() == null) Thread.sleep(100);
            }
            WebView view = web.get();
            assertNotNull("Capacitor WebView is missing", view);
            eventually(running, view, "!!document.querySelector('.bottom-nav button:nth-child(3)')");
            Log.i("MultiCamFreezeTest", "DIAGNOSTIC ONLY: comparing minimal compositor paint; no production CSS changed");
            String style = "*,*::before,*::after{" +
                "background-image:none!important;" +
                "-webkit-backdrop-filter:none!important;" +
                "backdrop-filter:none!important;" +
                "box-shadow:none!important;" +
                "text-shadow:none!important;" +
                "filter:none!important;" +
                "animation:none!important;" +
                "transition:none!important;}";
            String inject = "(function(){var s=document.createElement('style');" +
                "s.id='multicam-ci-minimal-paint-only';s.textContent=" +
                org.json.JSONObject.quote(style) +
                ";document.head.appendChild(s);return true})()";
            assertEquals("true", eval(running, view, inject));
            for (int i = 0; i < 2; i++) {
                click(running, view, ".bottom-nav button:nth-child(3)");
                eventually(running, view, "!!document.querySelector('.settings-fold-workspace')");
                click(running, view, ".bottom-nav button:nth-child(1)");
                eventually(running, view, "!!document.querySelector('.camera-screen')");
            }
        } finally {
            finishAndWait(activity);
        }
    }

    /**
     * TEST ONLY: rerun the real Camera -> Settings -> Camera path with a
     * software-composited WebView surface. Do not touch the shipping layer,
     * Camera2, media access or app capabilities. This separates Android HWUI
     * / emulator GPU contention from V8/React navigation defects.
     */
    @Test
    public void aSoftwareLayerDiagnosticKeepsRealScreensResponsive() throws Exception {
        Activity activity = null;
        try {
            Intent launch = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),
                MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
            assertNotNull(activity);
            Activity running = activity;
            AtomicReference<WebView> web = new AtomicReference<>();
            for (int attempt = 0; attempt < 60 && web.get() == null; attempt++) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    web.set(findWebView(running.getWindow().getDecorView())));
                if (web.get() == null) Thread.sleep(100);
            }
            WebView view = web.get();
            assertNotNull("Capacitor WebView is missing", view);
            eventually(running, view, "!!document.querySelector('.bottom-nav button:nth-child(3)')");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                view.setLayerType(View.LAYER_TYPE_SOFTWARE, null));
            assertEquals("Software layer diagnostic must actually activate",
                View.LAYER_TYPE_SOFTWARE, view.getLayerType());
            Log.i("MultiCamFreezeTest", "DIAGNOSTIC ONLY: WebView software layer for Settings navigation");
            for (int i = 0; i < 2; i++) {
                click(running, view, ".bottom-nav button:nth-child(3)");
                eventually(running, view, "!!document.querySelector('.settings-fold-workspace')");
                click(running, view, ".bottom-nav button:nth-child(1)");
                eventually(running, view, "!!document.querySelector('.camera-screen')");
            }
        } finally {
            finishAndWait(activity);
        }
    }

    /**
     * Astra priority: emulate installing/opening the app and doing absolutely
     * nothing for thirty seconds. No camera permission, capture, imported
     * media, tab click or native panel should be necessary to stay responsive.
     * Only the one baseline DOM query and independent JS response are sampled.
     */
    @Test
    public void a00ColdStartIdleThirtySecondsWithoutTouches() throws Exception {
        Activity activity = null;
        try {
            Intent launch = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),
                MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
            assertNotNull(activity);
            Activity running = activity;
            AtomicReference<WebView> web = new AtomicReference<>();
            for (int attempt = 0; attempt < 60 && web.get() == null; attempt++) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    web.set(findWebView(running.getWindow().getDecorView())));
                if (web.get() == null) Thread.sleep(100);
            }
            WebView view = web.get();
            assertNotNull("Cold-launch Capacitor WebView is missing", view);
            eventually(running, view, "!!document.querySelector('.bottom-nav button:nth-child(3)')");
            long start = android.os.SystemClock.uptimeMillis();
            int checks = 0;
            while (android.os.SystemClock.uptimeMillis() - start < 30000L) {
                assertEquals("Idle renderer JS stopped after " + checks + " samples",
                    "true", eval(running, view, "1+1===2"));
                assertEquals("Cold-launch camera shell disappeared", "true",
                    eval(running, view,
                        "!!document.querySelector('.bottom-nav button:nth-child(3)')"));
                checks++;
                Thread.sleep(1500);
            }
            assertTrue("The test did not complete a full thirty-second idle session", checks >= 15);
        } finally {
            finishAndWait(activity);
        }
    }

    /** An idle camera UI must keep Chromium responsive before any Settings
     * interaction. This isolates startup renderer failure from navigation. */
    @Test
    public void a0IdleLaunchRendererRespondsWithoutUserMedia() throws Exception {
        Activity activity = null;
        try {
            Intent launch = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),
                MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
            assertNotNull(activity);
            Activity running = activity;
            AtomicReference<WebView> web = new AtomicReference<>();
            for (int attempt = 0; attempt < 60 && web.get() == null; attempt++) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    web.set(findWebView(running.getWindow().getDecorView())));
                if (web.get() == null) Thread.sleep(100);
            }
            assertNotNull("Capacitor WebView is missing", web.get());
            eventually(running, web.get(), "!!document.querySelector('.bottom-nav button:nth-child(3)')");
            // An emulator Activity may report visibilityState=hidden even
            // while its JS renderer and Camera screen are fully responsive.
            // Check the real DOM and repeated JS responses independently.
            eventually(running, web.get(), "!!document.querySelector('.camera-screen')");
            for (int i = 0; i < 3; i++) {
                Thread.sleep(1500);
                String evidence = eval(running, web.get(),
                    "(function(){return JSON.stringify({visibility:document.visibilityState," +
                    "camera:!!document.querySelector('.camera-screen')," +
                    "loading:!!document.querySelector('.studio-tab-loading')," +
                    "tab:document.documentElement.dataset.activeMulticamTab})})()");
                assertEquals("Idle Camera disappeared; diagnostic=" + evidence,
                    "true", eval(running, web.get(),
                    "!!document.querySelector('.camera-screen')"));
                assertEquals("JavaScript event loop did not respond", "true",
                    eval(running, web.get(), "1+1===2"));
            }
        } finally {
            finishAndWait(activity);
        }
    }

    @Test
    public void navigationAndEditorAudioTransitionsAreResponsive() throws Exception {
        Activity activity = null;
        try {
            Intent launch = new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(),
                MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity = InstrumentationRegistry.getInstrumentation().startActivitySync(launch);
            assertNotNull(activity);
            Activity running = activity;
            AtomicReference<WebView> web = new AtomicReference<>();
            // runOnUiThread is asynchronous when invoked from test thread.
            // The old test read the reference immediately and falsely failed
            // "WebView is missing" before the runnable had even executed.
            for (int attempt = 0; attempt < 60 && web.get() == null; attempt++) {
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    web.set(findWebView(running.getWindow().getDecorView())));
                if (web.get() == null) Thread.sleep(100);
            }
            WebView view = web.get();
            assertNotNull("Capacitor WebView is missing", view);
            eventually(running, view, "!!document.querySelector('.bottom-nav button:nth-child(3)')");
            // Fifteen real-world tab switches without starting camera or importing clips.
            for (int i=0; i<15; i++) {
                click(running, view, ".bottom-nav button:nth-child(3)");
                eventually(running, view, "!!document.querySelector('.settings-fold-workspace')");
                click(running, view, ".bottom-nav button:nth-child(1)");
                eventually(running, view, "!!document.querySelector('.camera-screen')");
            }
            click(running, view, ".bottom-nav button:nth-child(2)");
            eventually(running, view, "!!document.querySelector('.editor-fold-workspace')");
            click(running, view, "button[role=tab][aria-selected=false]");
            eventually(running, view, "!!document.querySelector('[role=tabpanel]')");
            click(running, view, "button[role=tab]:nth-child(3)");
            eventually(running, view, "!!document.querySelector('[role=tabpanel]')");
            click(running, view, ".bottom-nav button:nth-child(3)");
            eventually(running, view, "!!document.querySelector('.settings-fold-workspace')");
        } finally {
            finishAndWait(activity);
        }
    }
}
