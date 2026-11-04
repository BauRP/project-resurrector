package app.lovable.multicampov;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

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
        UiFreezeMonitor.start(getApplicationContext());
    }

    @Override protected void onResume() {
        super.onResume();
        UiFreezeMonitor.setForeground(true);
    }

    @Override protected void onPause() {
        UiFreezeMonitor.setForeground(false);
        super.onPause();
    }

    @Override protected void onDestroy() {
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
        } catch (Exception error) {
            error.printStackTrace();
        }
    }
}
