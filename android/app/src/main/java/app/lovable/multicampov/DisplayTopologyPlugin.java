package app.lovable.multicampov;

import android.graphics.Rect;
import android.util.DisplayMetrics;
import android.view.View;

import androidx.core.util.Consumer;
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import androidx.window.layout.DisplayFeature;
import androidx.window.layout.FoldingFeature;
import androidx.window.layout.WindowInfoTracker;
import androidx.window.layout.WindowLayoutInfo;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.concurrent.Executor;
import java.util.HashSet;
import java.util.Set;

/**
 * Reports actual window/folding features exposed by Android Jetpack WindowManager.
 * Unknown posture is not rewritten as "closed" or "unsupported". No fake hinges.
 */
@CapacitorPlugin(name = "DisplayTopology")
public class DisplayTopologyPlugin extends Plugin {
    private WindowInfoTrackerCallbackAdapter adapter;
    private Consumer<WindowLayoutInfo> listener;
    private WindowLayoutInfo latest;
    private long revision = 0L;
    /** Leases are specific to a WebView adaptation instance. A late stop
     * from an old screen must never close a listener held by its successor.
     */
    private final Set<String> activeOwners = new HashSet<>();

    private synchronized JSObject snapshot() {
        JSObject result = new JSObject();
        View root = getActivity().getWindow().getDecorView();
        DisplayMetrics metrics = getContext().getResources().getDisplayMetrics();
        float density = metrics.density > 0 ? metrics.density : 1f;
        int width = root.getWidth(), height = root.getHeight();
        result.put("widthPx", width);
        result.put("heightPx", height);
        result.put("widthDp", width / density);
        result.put("heightDp", height / density);
        result.put("density", density);
        // Expose inset diagnostics; the WebView independently applies CSS env(safe-area-*)
        // so these values must not be blindly added as a second padding.
        WindowInsetsCompat windowInsets = ViewCompat.getRootWindowInsets(root);
        if (windowInsets != null) {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            JSObject safe = new JSObject();
            safe.put("left", insets.left); safe.put("top", insets.top);
            safe.put("right", insets.right); safe.put("bottom", insets.bottom);
            result.put("systemInsetsPx", safe);
        }
        result.put("revision", revision);
        result.put("posture", "unknown");
        result.put("source", "android-windowmanager");
        JSArray hinges = new JSArray();
        if (latest != null) {
            for (DisplayFeature feature : latest.getDisplayFeatures()) {
                if (!(feature instanceof FoldingFeature)) continue;
                FoldingFeature fold = (FoldingFeature) feature;
                Rect bounds = fold.getBounds();
                JSObject item = new JSObject();
                item.put("leftPx", bounds.left);
                item.put("topPx", bounds.top);
                item.put("rightPx", bounds.right);
                item.put("bottomPx", bounds.bottom);
                item.put("orientation", fold.getOrientation().toString());
                item.put("state", fold.getState().toString());
                item.put("occlusion", fold.getOcclusionType().toString());
                item.put("separating", fold.isSeparating());
                hinges.put(item);
            }
            result.put("posture", "reported");
        }
        result.put("foldingFeatures", hinges);
        return result;
    }

    @PluginMethod
    public void getState(PluginCall call) { call.resolve(snapshot()); }

    @PluginMethod
    public synchronized void startObserving(PluginCall call) {
        String ownerId = call.getString("ownerId");
        if (ownerId == null || ownerId.isEmpty()) {
            call.reject("Fold observer ownerId is required");
            return;
        }
        if (listener != null) {
            activeOwners.add(ownerId);
            call.resolve(snapshot());
            return;
        }
        try {
            adapter = new WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(getActivity()));
            Executor main = getActivity().getMainExecutor();
            listener = info -> {
                synchronized (DisplayTopologyPlugin.this) {
                    latest = info;
                    revision++;
                }
                notifyListeners("topologyChanged", snapshot());
            };
            adapter.addWindowLayoutInfoListener(getActivity(), main, listener);
            activeOwners.add(ownerId);
            call.resolve(snapshot());
        } catch (RuntimeException error) {
            stopListener();
            call.reject("Window topology observer unavailable: " + error.getMessage());
        }
    }

    @PluginMethod
    public synchronized void stopObserving(PluginCall call) {
        String ownerId = call.getString("ownerId");
        if (ownerId == null || ownerId.isEmpty()) {
            call.reject("Fold observer ownerId is required");
            return;
        }
        activeOwners.remove(ownerId);
        if (activeOwners.isEmpty()) stopListener();
        call.resolve();
    }

    private synchronized void stopListener() {
        if (listener != null && adapter != null) {
            try { adapter.removeWindowLayoutInfoListener(listener); }
            catch (RuntimeException ignored) { /* Activity may be destroyed. */ }
        }
        listener = null;
        adapter = null;
        latest = null;
    }

    @Override
    protected void handleOnDestroy() {
        activeOwners.clear();
        stopListener();
        super.handleOnDestroy();
    }
}
