package app.lovable.multicampov;

import android.os.Bundle;
import android.content.Intent;
import android.app.AlertDialog;
import android.util.Log;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.os.Build;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewRenderProcess;
import android.webkit.WebViewRenderProcessClient;
import android.webkit.RenderProcessGoneDetail;

import com.getcapacitor.BridgeWebViewClient;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private AlertDialog recoveryDialog;
    private boolean recoveryPromptShown;
    private boolean rendererTerminated;

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
        dismissRecoveryDialog();
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
            // Keep Capacitor's resource interception, navigation and plugin
            // callbacks: a plain android.webkit.WebViewClient would break them.
            // Register renderer recovery through the same BridgeWebViewClient.
            webView.setWebViewClient(new BridgeWebViewClient(bridge) {
                @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    super.onRenderProcessGone(view, detail);
                    rendererTerminated = true;
                    UiFreezeMonitor.recordRendererGone(detail.didCrash());
                    // Android forbids using this WebView after renderer death.
                    // Keep the Camera2 foreground service independent: do not
                    // stop native recording or remove anything from storage.
                    try {
                        ViewParent parent = view.getParent();
                        if (parent instanceof ViewGroup) ((ViewGroup) parent).removeView(view);
                        view.destroy();
                    } catch (RuntimeException error) {
                        Log.e("MultiCamWebView", "Failed to dispose dead WebView", error);
                    }
                    showRecoveryDialog(true);
                    return true;
                }
            });
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // Monitor native renderer state, independent of Capacitor
                // and of JavaScript heartbeats. Do not terminate it.
                webView.setWebViewRenderProcessClient(new WebViewRenderProcessClient() {
                    @Override public void onRenderProcessUnresponsive(WebView view, WebViewRenderProcess renderer) {
                        UiFreezeMonitor.recordRendererUnresponsive();
                        runOnUiThread(() -> showRecoveryDialog(false));
                    }
                    @Override public void onRenderProcessResponsive(WebView view, WebViewRenderProcess renderer) {
                        UiFreezeMonitor.recordRendererResponsive();
                        runOnUiThread(() -> {
                            if (!rendererTerminated) {
                                recoveryPromptShown = false;
                                dismissRecoveryDialog();
                            }
                        });
                    }
                });
            }
        } catch (Exception error) {
            error.printStackTrace();
        }
    }
    private void dismissRecoveryDialog() {
        if (recoveryDialog == null) return;
        try { recoveryDialog.dismiss(); }
        catch (RuntimeException ignored) { /* Activity may be closing. */ }
        recoveryDialog = null;
    }

    /** Android MAIN can still respond while Chromium JS is permanently hung.
     * Offer a NATIVE recovery choice that never requires WebView to draw a
     * dialog or acknowledge a Capacitor plugin callback.
     * Do NOT automatically kill a WebView that might own an unsaved recording.
     */
    private void showRecoveryDialog(boolean gone) {
        if (isFinishing() || isDestroyed()) return;
        if (recoveryPromptShown && !gone) return;
        recoveryPromptShown = true;
        dismissRecoveryDialog();
        final String message = gone
            ? "Процесс отображения WebView завершился. Старый экран уже нельзя использовать. " +
              "Записи и сохранённые проекты не удалены. Перезапустите интерфейс."
            : "WebView перестал отвечать. Можно подождать или перезапустить интерфейс вручную. " +
              "При WebView-записи несохранённое видео может быть потеряно; " +
              "нативная Camera2-запись не останавливается автоматически.";
        recoveryDialog = new AlertDialog.Builder(this)
            .setTitle(gone ? "Восстановление MULTI-CAM POV" : "Интерфейс не отвечает")
            .setMessage(message)
            .setPositiveButton("Перезапустить интерфейс", (dialog, which) -> restartUi())
            .setNegativeButton(gone ? "Позже" : "Подождать", (dialog, which) -> { })
            .create();
        try { recoveryDialog.show(); }
        catch (RuntimeException error) {
            Log.e("MultiCamWebView", "Could not show native recovery", error);
        }
    }

    private void restartUi() {
        if (isFinishing() || isDestroyed()) return;
        UiFreezeMonitor.recordManualRecovery();
        Intent intent = new Intent(this, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

}
