package app.lovable.multicampov;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.view.ViewGroup;
import android.view.ViewParent;

/** DEBUG ONLY: independent Chromium/WebView baseline without React/Capacitor. */
public final class MinimalWebViewActivity extends Activity {
    private WebView view;
    @Override public void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        view = new WebView(this);
        view.getSettings().setJavaScriptEnabled(true);
        setContentView(view);
        String html = "<!doctype html><html><head><meta name='viewport' " +
            "content='width=device-width,initial-scale=1'></head>" +
            "<body><button id='baseline'>Control</button>" +
            "<div id='status'>ready</div></body></html>";
        view.loadDataWithBaseURL("https://localhost/", html,
            "text/html", "UTF-8", null);
    }
    @Override public void onDestroy() {
        if (view != null) {
            // Remove Chromium's surface from its parent before destroying it.
            // Otherwise a software GPU emulator may keep a stale compositor
            // layer while the next, real Capacitor Activity is being started.
            WebView retiring = view;
            view = null;
            retiring.stopLoading();
            ViewParent parent = retiring.getParent();
            if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(retiring);
            retiring.destroy();
        }
        super.onDestroy();
    }
}
