package app.lovable.multicampov;

import android.os.Bundle;
import android.os.Build;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewRenderProcess;
import android.webkit.WebViewRenderProcessClient;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MultiCamNativePlugin.class);
        registerPlugin(NativeCapturePlugin.class);
        registerPlugin(DisplayTopologyPlugin.class);
        registerPlugin(DeviceMetricsPlugin.class);
        registerPlugin(UiFreezePlugin.class);
        registerPlugin(RawDngPlugin.class);
        registerPlugin(StabilizationProbePlugin.class);
        super.onCreate(savedInstanceState);
        configureWebView();
        UiFreezeMonitor.start(getApplicationContext(),
            bridge != null ? bridge.getWebView() : null);
    }

    @Override public void onResume() {
        super.onResume();
        UiFreezeMonitor.setForeground(true);
    }

    @Override public void onPause() {
        UiFreezeMonitor.setForeground(false);
        super.onPause();
    }

    @Override public void onDestroy() {
        UiFreezeMonitor.stop();
        super.onDestroy();
    }

    private void configureWebView() {
        try {
            WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
            if (webView == null) return;

            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setJavaScriptEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false);
            webView.setBackgroundColor(0xFF12161F);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Monitor native renderer state, independent of Capacitor
                // and of JavaScript heartbeats. Do not terminate it.
                webView.setWebViewRenderProcessClient(new WebViewRenderProcessClient() {
                    @Override public void onRenderProcessUnresponsive(WebView view, WebViewRenderProcess renderer) {
                        UiFreezeMonitor.recordRendererUnresponsive();
                    }
                    @Override public void onRenderProcessResponsive(WebView view, WebViewRenderProcess renderer) {
                        UiFreezeMonitor.recordRendererResponsive();
                    }
                });
            }
        } catch (Exception error) {
            error.printStackTrace();
        }
    }
}
