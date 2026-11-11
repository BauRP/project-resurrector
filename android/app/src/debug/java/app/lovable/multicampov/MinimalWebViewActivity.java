package app.lovable.multicampov;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;

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
            view.stopLoading();
            view.destroy();
            view = null;
        }
        super.onDestroy();
    }
}
