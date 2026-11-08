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
            fail(evidence.toString());
        }
        return result.get();
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

    /** An idle camera UI must keep Chromium responsive before any Settings
     * interaction. This isolates startup renderer failure from navigation. */
    @Test
    public void idleLaunchRendererRespondsWithoutUserMedia() throws Exception {
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
            for (int i = 0; i < 3; i++) {
                Thread.sleep(1500);
                assertEquals("true", eval(running, web.get(),
                    "(function(){return document.visibilityState==='visible'&&!!document.querySelector('.camera-screen')})()"));
            }
        } finally {
            if (activity != null) activity.finish();
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
            for (int i=0; i<4; i++) {
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
            if (activity != null) activity.finish();
        }
    }
}
