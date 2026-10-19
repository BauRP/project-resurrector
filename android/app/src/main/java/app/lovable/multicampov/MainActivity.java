package app.lovable.multicampov;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(MultiCamNativePlugin.class);
        configureWebView();
    }

    private void configureWebView() {
        try {
            WebView webView = this.bridge != null ? this.bridge.getWebView() : null;
            if (webView == null) return;

            WebSettings settings = webView.getSettings();
            settings.setDomStorageEnabled(true);        // localStorage — обязателен для стора приложения
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);
            settings.setJavaScriptEnabled(true);
            settings.setMediaPlaybackRequiresUserGesture(false); // автоплей видео для камеры/превью

            // Тёмный фон WebView — убирает «белую вспышку» и разницу между эмуляторами
            webView.setBackgroundColor(0xFF12161F);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
