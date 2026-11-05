package app.lovable.multicampov;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
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
        assertTrue("WebView renderer stopped replying to " + javascript,
            reply.await(12, TimeUnit.SECONDS));
        return result.get();
    }

    private static void eventually(Activity activity, WebView view, String expression) throws Exception {
        long deadline = System.currentTimeMillis() + 12000;
        while (System.currentTimeMillis() < deadline) {
            if ("true".equals(eval(activity, view, expression))) return;
            Thread.sleep(180);
        }
        fail("WebView did not display " + expression);
    }

    private static void click(Activity activity, WebView view, String selector) throws Exception {
        String script = "(function(){var b=document.querySelector(" +
            org.json.JSONObject.quote(selector) +
            ");if(!b)return false;b.click();return true})()";
        assertEquals("true", eval(activity, view, script));
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
            running.runOnUiThread(() -> {
                // Read the view hierarchy, not BridgeActivity's protected
                // bridge field (which instrumentation cannot legally access).
                web.set(findWebView(running.getWindow().getDecorView()));
            });
            // JavaScript polls until the initial React navigation is visible.
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
