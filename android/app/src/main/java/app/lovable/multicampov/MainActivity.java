package app.lovable.multicampov;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MultiCamNativePlugin.class);
        registerPlugin(DisplayTopologyPlugin.class);
        super.onCreate(savedInstanceState);
        configureWebView();
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
