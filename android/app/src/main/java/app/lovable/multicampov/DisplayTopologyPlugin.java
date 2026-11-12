package app.lovable.multicampov;

import android.graphics.Rect;
import android.app.Activity;
import android.os.Looper;
import android.util.DisplayMetrics;
import androidx.core.content.ContextCompat;
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
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

/**
 * Reports actual window/folding features exposed by Android Jetpack WindowManager.
 * Unknown posture is not rewritten as "closed" or "unsupported". No fake hinges.
 */
@CapacitorPlugin(name = "DisplayTopology")
public class DisplayTopologyPlugin extends Plugin {
    // Independent native safety gate for the TextureView overlay. JavaScript
    // may have an outdated layout when a queued show command executes.
    // Store only real WindowManager separating features, never fake hinges.
    private static final Object SURFACE_LOCK=new Object();
    private static final int MAX_FOLD_FEATURES=32;
    private static String surfaceLease="";
    private static boolean surfaceTopologyObserved=false;
    private static int surfaceWindowWidth=0, surfaceWindowHeight=0;
    // Once native hinge observation has started, an absent observer is
    // UNKNOWN safety, not proof that there is no hinge in the new Activity.
    private static boolean surfaceObservationRequired=false;
    private static final ArrayList<Rect> surfaceHinges=new ArrayList<>();

    private static void armSurfaceLease(String lease){
        synchronized(SURFACE_LOCK){
            surfaceLease=lease;
            surfaceObservationRequired=true;
            surfaceTopologyObserved=false;
            surfaceWindowWidth=0;surfaceWindowHeight=0;
            surfaceHinges.clear();
        }
    }
    private void updateSurfaceHinges(String lease,WindowLayoutInfo layout){
        // Physical WindowManager hinge bounds must belong to this Activity.
        // Unknown dimensions remain unsafe, not an invented single pane.
        final android.app.Activity host=getActivity();
        final View decor=host==null?null:host.getWindow().getDecorView();
        final int windowWidth=decor==null?0:decor.getWidth();
        final int windowHeight=decor==null?0:decor.getHeight();
        boolean changed=false;
        synchronized(SURFACE_LOCK){
            if(!lease.equals(surfaceLease))return;
            // A real Activity may shrink from unfolded to cover display
            // while a TextureView placement from the old viewport is queued.
            boolean windowChanged=surfaceWindowWidth!=windowWidth ||
                surfaceWindowHeight!=windowHeight;
            surfaceWindowWidth=windowWidth;surfaceWindowHeight=windowHeight;
            ArrayList<Rect> nextHinges=new ArrayList<>();
            if(layout.getDisplayFeatures().size()>MAX_FOLD_FEATURES){
                // Invalid OEM data volume: block the entire direct preview,
                // never infer that the fold disappeared or trust a stale pane.
                nextHinges.add(new Rect(Integer.MIN_VALUE/4,
                    Integer.MIN_VALUE/4,Integer.MAX_VALUE/4,Integer.MAX_VALUE/4));
            } else for(DisplayFeature feature:layout.getDisplayFeatures()){
                if(!(feature instanceof FoldingFeature))continue;
                FoldingFeature fold=(FoldingFeature)feature;
                if(!fold.isSeparating())continue;
                Rect hinge=new Rect(fold.getBounds());
                // Invalid/unknown separating bounds are not evidence of
                // a safe pane. Fail closed until WindowManager reports valid
                // geometry, rather than positioning the overlay over a hinge.
                if(hinge.width()<0||hinge.height()<0 ||
                   hinge.width()==0&&hinge.height()==0 ||
                   windowWidth<=0||windowHeight<=0 ||
                   hinge.left<0||hinge.top<0 ||
                   hinge.right>windowWidth||hinge.bottom>windowHeight){
                    nextHinges.add(new Rect(Integer.MIN_VALUE/4,
                        Integer.MIN_VALUE/4,Integer.MAX_VALUE/4,Integer.MAX_VALUE/4));
                    continue;
                }
                if(hinge.width()==0){hinge.left-=2;hinge.right+=2;}
                if(hinge.height()==0){hinge.top-=2;hinge.bottom+=2;}
                nextHinges.add(hinge);
            }
            // WindowManager callbacks may repeat the same separating geometry
            // in another order. Only REAL changes need a native overlay check.
            Collections.sort(nextHinges,(a,b)->{
                if(a.left!=b.left)return Integer.compare(a.left,b.left);
                if(a.top!=b.top)return Integer.compare(a.top,b.top);
                if(a.right!=b.right)return Integer.compare(a.right,b.right);
                return Integer.compare(a.bottom,b.bottom);
            });
            changed=windowChanged || !surfaceTopologyObserved ||
                !surfaceHinges.equals(nextHinges);
            surfaceHinges.clear();
            surfaceHinges.addAll(nextHinges);
            surfaceTopologyObserved=true;
        }
        // The first observed topology resolves the safety gate. A repeated
        // no-op notification must not schedule needless camera UI work.
        if(changed)NativeCapturePlugin.onFoldGeometryChanged();
    }
    static boolean isUnsafeDirectPreviewWindowRect(Rect rect){
        synchronized(SURFACE_LOCK){
            if(rect==null||rect.width()<=0||rect.height()<=0)return true;
            if(surfaceObservationRequired&&!surfaceTopologyObserved)return true;
            if(surfaceObservationRequired &&
               (surfaceWindowWidth<=0||surfaceWindowHeight<=0 ||
                rect.left<0||rect.top<0 ||
                rect.right>surfaceWindowWidth||rect.bottom>surfaceWindowHeight))
                return true;
            for(Rect hinge:surfaceHinges)
                if(Rect.intersects(rect,hinge))return true;
            return false;
        }
    }
    private static boolean disarmSurfaceLease(String lease){
        synchronized(SURFACE_LOCK){
            if(!lease.equals(surfaceLease))return false;
            surfaceLease="";
            surfaceTopologyObserved=false;
            surfaceWindowWidth=0;surfaceWindowHeight=0;
            surfaceHinges.clear();
            return true;
        }
    }
    // Register/unregister OEM WindowManager Binder listeners outside Android
    // MAIN. Observed View geometry and listener state still live on MAIN.
    private final java.util.concurrent.ExecutorService registrationWorker =
        java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "multicam-fold-registration");
            t.setDaemon(true);
            return t;
        });
    private WindowInfoTrackerCallbackAdapter adapter;
    private Consumer<WindowLayoutInfo> listener;
    private WindowLayoutInfo latest;
    private long revision = 0L;
    /** Repeated OEM notifications must not repaint Settings. */
    private String lastNotifiedGeometry = null;
    /** Reject queued topology callbacks belonging to a stopped observer. */
    private long observerGeneration = 0L;
    /** One unique lease per WindowManager listener registration. This lease
     * prevents a destroyed Activity from injecting late fold observations into
     * the Camera2 service owned by its successor.
     */
    private String observerLease;
    /** Leases are specific to a WebView adaptation instance. A late stop
     * from an old screen must never close a listener held by its successor.
     */
    private final Set<String> activeOwners = new HashSet<>();
    // Registration itself runs on a background worker. Until Android
    // confirms it, additional callers must NOT get an early success.
    private static final class PendingRegistration {
        final String ownerId;
        final PluginCall call;
        PendingRegistration(String ownerId, PluginCall call) {
            this.ownerId = ownerId; this.call = call;
        }
    }
    private boolean registrationPending = false;
    private final ArrayList<PendingRegistration> registrationCalls = new ArrayList<>();
    private void finishRegistrationCalls(String error) {
        ArrayList<PendingRegistration> waiting = new ArrayList<>(registrationCalls);
        registrationCalls.clear();
        registrationPending = false;
        JSObject result = error == null ? snapshot() : null;
        for (PendingRegistration entry : waiting) {
            if (error != null) entry.call.reject(error);
            else entry.call.resolve(result);
        }
    }

    // Called on Android MAIN only. Reads View dimensions/insets and must
    // never run on CapacitorPlugins' background taskHandler thread.
    private JSObject snapshot() {
        JSObject result = new JSObject();
        final android.app.Activity host=getActivity();
        if(host==null||host.isDestroyed()){
            // A queued WindowManager callback may outlive an Activity during
            // a fold or display handoff. Unknown dimensions are safer than
            // throwing from snapshot() and crashing the app.
            result.put("widthPx",0);result.put("heightPx",0);
            result.put("widthDp",0);result.put("heightDp",0);
            result.put("density",1);
            result.put("revision",revision);
            result.put("posture","unknown");
            result.put("source","android-activity-unavailable");
            result.put("foldingFeatures",new JSArray());
            return result;
        }
        View root = host.getWindow().getDecorView();
        DisplayMetrics metrics = host.getResources().getDisplayMetrics();
        float density = metrics.density > 0 ? metrics.density : 1f;
        int width = root.getWidth(), height = root.getHeight();
        result.put("widthPx", width);
        result.put("heightPx", height);
        result.put("widthDp", width / density);
        result.put("heightDp", height / density);
        result.put("density", density);
        // FoldingFeature bounds are in Android WINDOW pixels. A Capacitor
        // WebView need not start at (0,0) or fill the DecorView (system bars,
        // multi-window, custom hosting). Report its measured bounds in the
        // same DecorView-relative pixel coordinate system, not Android dp.
        // JavaScript converts the resulting clipped rectangle into CSS px.
        View webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView != null && webView.getWidth() > 0 && webView.getHeight() > 0) {
            int[] origin = new int[2];
            int[] webOrigin = new int[2];
            root.getLocationInWindow(origin);
            webView.getLocationInWindow(webOrigin);
            int left = webOrigin[0] - origin[0];
            int top = webOrigin[1] - origin[1];
            JSObject viewport = new JSObject();
            viewport.put("left", left);
            viewport.put("top", top);
            viewport.put("right", left + webView.getWidth());
            viewport.put("bottom", top + webView.getHeight());
            result.put("webViewBoundsPx", viewport);
        }
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
            if(latest.getDisplayFeatures().size()>MAX_FOLD_FEATURES){
                result.put("posture","unknown");
                result.put("source","android-windowmanager-feature-overflow");
                result.put("foldingFeatures",hinges);
                return result;
            }
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

    /** Exact measured window geometry, independent of CSS child layout.
     * All fold states, insets, device density and WebView movements stay observable. */
    private String measuredWindowFingerprint() {
        android.app.Activity host = getActivity();
        if (host == null || host.isDestroyed()) return "activity-unavailable";
        View root = host.getWindow().getDecorView();
        StringBuilder key = new StringBuilder();
        key.append(root.getWidth()).append(',').append(root.getHeight())
            .append(',').append(host.getResources().getDisplayMetrics().densityDpi);
        View web = getBridge() == null ? null : getBridge().getWebView();
        if (web != null) {
            int[] rootOrigin = new int[2];
            int[] webOrigin = new int[2];
            root.getLocationInWindow(rootOrigin);
            web.getLocationInWindow(webOrigin);
            key.append('|').append(webOrigin[0] - rootOrigin[0])
                .append(',').append(webOrigin[1] - rootOrigin[1])
                .append(',').append(web.getWidth()).append(',').append(web.getHeight());
        } else key.append("|no-webview");
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(root);
        if (insets != null) {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() |
                WindowInsetsCompat.Type.displayCutout());
            key.append('|').append(bars.left).append(',').append(bars.top)
                .append(',').append(bars.right).append(',').append(bars.bottom);
        }
        return key.toString();
    }

    /**
     * Capacitor invokes plugin methods from its worker. Every View read and
     * WindowManager owner transition runs on Android MAIN. No instance
     * monitor is held while registering/unregistering OEM listeners.
     */
    private void onUiThread(PluginCall call, Runnable action) {
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("Fold Activity unavailable");
            return;
        }
        final Runnable safe = () -> {
            if (activity.isFinishing() || activity.isDestroyed()) {
                call.reject("Fold Activity unavailable");
                return;
            }
            try { action.run(); }
            catch (RuntimeException error) {
                call.reject("Window topology operation failed: " + error.getMessage());
            }
        };
        if (Looper.myLooper() == Looper.getMainLooper()) safe.run();
        else activity.runOnUiThread(safe);
    }

    // A WebView timeout does not remove a queued Android MAIN task. Multiple
    // getState() retries used to enqueue separate measurements while startup
    // was slow. Coalesce them into ONE UI task with bounded waiting calls.
    // The lock never wraps View reads, JS bridge replies or OEM code.
    private static final int MAX_PENDING_STATE_READS = 24;
    private final Object stateReadLock = new Object();
    private final ArrayList<PluginCall> pendingStateReads = new ArrayList<>();
    private boolean stateReadScheduled = false;

    private void completeStateReads(JSObject state, String error) {
        final ArrayList<PluginCall> waiting;
        synchronized (stateReadLock) {
            waiting = new ArrayList<>(pendingStateReads);
            pendingStateReads.clear();
            stateReadScheduled = false;
        }
        for (PluginCall waitingCall : waiting) {
            if (error != null) waitingCall.reject(error);
            else waitingCall.resolve(state);
        }
    }

    @PluginMethod
    public void getState(PluginCall call) {
        final boolean schedule;
        final boolean overflow;
        synchronized (stateReadLock) {
            overflow = pendingStateReads.size() >= MAX_PENDING_STATE_READS;
            if (!overflow) pendingStateReads.add(call);
            schedule = !overflow && !stateReadScheduled;
            if (schedule) stateReadScheduled = true;
        }
        if (overflow) {
            call.reject("Android display geometry request queue full");
            return;
        }
        if (!schedule) return;
        final Activity host = getActivity();
        if (host == null || host.isFinishing() || host.isDestroyed()) {
            completeStateReads(null, "Fold Activity unavailable");
            return;
        }
        try {
            host.runOnUiThread(() -> {
                if (host.isFinishing() || host.isDestroyed()) {
                    completeStateReads(null, "Fold Activity unavailable");
                    return;
                }
                try { completeStateReads(snapshot(), null); }
                catch (RuntimeException error) {
                    completeStateReads(null, "Android display geometry failed: " + error.getMessage());
                }
            });
        } catch (RuntimeException error) {
            completeStateReads(null, "Android display geometry unavailable: " + error.getMessage());
        }
    }

    @PluginMethod
    public void startObserving(PluginCall call) {
        onUiThread(call, () -> startObservingOnUi(call));
    }
    private void startObservingOnUi(PluginCall call) {
        String ownerId = call.getString("ownerId");
        if (ownerId == null || ownerId.isEmpty()) {
            call.reject("Fold observer ownerId is required");
            return;
        }
        final android.app.Activity host=getActivity();
        if(host==null||host.isDestroyed()||host.isFinishing()){
            call.reject("Fold Activity unavailable");return;
        }
        if (listener != null) {
            activeOwners.add(ownerId);
            if (registrationPending)
                registrationCalls.add(new PendingRegistration(ownerId, call));
            else call.resolve(snapshot());
            return;
        }
        try {
            lastNotifiedGeometry = null;
            adapter = new WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(host));
            // API 28 Context.getMainExecutor is not available on Android 7.
            // Jetpack ContextCompat keeps real WindowManager callbacks on main.
            Executor main = ContextCompat.getMainExecutor(getContext());
            final long ownerGeneration = ++observerGeneration;
            final String lease = java.util.UUID.randomUUID().toString();
            observerLease = lease;
            listener = info -> {
                JSObject pendingTopologyNotification = null;
                // WindowInfoTracker was registered with Android MAIN executor,
                // the same thread as start/stop and snapshot. No Java monitor
                // may surround recording observation or View geometry reads.
                {
                    // A queued callback may arrive after observer teardown or
                    // after a newer Activity has registered its own listener.
                    if (ownerGeneration != observerGeneration || listener == null ||
                            activeOwners.isEmpty()) return;
                    latest = info;
                    updateSurfaceHinges(lease,info);
                    int foldCount=0;
                    ArrayList<String> postureFeatures=new ArrayList<>();
                    ArrayList<String> geometryFeatures=new ArrayList<>();
                    for(DisplayFeature feature:info.getDisplayFeatures()){
                        if(!(feature instanceof FoldingFeature))continue;
                        FoldingFeature fold=(FoldingFeature)feature;
                        foldCount++;
                        Rect bounds=fold.getBounds();
                        // Hinge state and topology are independent of coordinates.
                        // Reordered WindowManager features must not count as a fold.
                        String posture=fold.getState()+":"+fold.getOrientation()+":"+
                            fold.getOcclusionType()+":"+fold.isSeparating();
                        postureFeatures.add(posture);
                        geometryFeatures.add(posture+":"+bounds.left+","+bounds.top+","+
                            bounds.right+","+bounds.bottom);
                    }
                    Collections.sort(postureFeatures);
                    Collections.sort(geometryFeatures);
                    // Android minSdk 24: use TextUtils.join, not String.join (API 26).
                    String postureSignature=foldCount+"|"+
                        android.text.TextUtils.join("|",postureFeatures);
                    String geometrySignature=foldCount+"|"+
                        android.text.TextUtils.join("|",geometryFeatures);
                    // A changing hinge rectangle is NOT proof of a changed
                    // folding posture. Geometry-only updates have their own counter.
                    NativeCaptureService.observeFoldDuringRecording(
                        lease,foldCount,postureSignature,geometrySignature);
                    // Continue every recording observation and safety check.
                    // Only real viewport, inset or hinge changes redraw WebView.
                    String nextGeometry = postureSignature + "|" + geometrySignature
                        + "|" + info.getDisplayFeatures().size()
                        + "|" + measuredWindowFingerprint();
                    if (!nextGeometry.equals(lastNotifiedGeometry)) {
                        lastNotifiedGeometry = nextGeometry;
                        revision++;
                        pendingTopologyNotification = snapshot();
                    }
                }
                // Bridge notification can be slow: never hold the observer
                // monitor while calling the Capacitor/WebView listener.
                if (pendingTopologyNotification != null)
                    notifyListeners("topologyChanged", pendingTopologyNotification);
            };
            activeOwners.add(ownerId);
            registrationPending = true;
            registrationCalls.add(new PendingRegistration(ownerId, call));
            // A mainExecutor may dispatch the initial layout synchronously.
            // Register the native lease BEFORE connecting the callback, or
            // its first (possibly only) posture can be discarded as stale.
            NativeCaptureService.observeFoldObserverActive(lease);
            armSurfaceLease(lease);
            // A successor observer initially has UNKNOWN geometry. Hide any
            // still-mounted old TextureView before the first WindowManager
            // callback can establish a new safe pane.
            NativeCapturePlugin.onFoldGeometryChanged();
            final WindowInfoTrackerCallbackAdapter registeringAdapter = adapter;
            final Consumer<WindowLayoutInfo> registeringListener = listener;
            // OEM registration can block on Binder. Queue it on a dedicated
            // thread and only take the measured View snapshot back on MAIN.
            registrationWorker.execute(() -> {
                try {
                    registeringAdapter.addWindowLayoutInfoListener(host, main, registeringListener);
                    host.runOnUiThread(() -> {
                        if (ownerGeneration != observerGeneration ||
                            listener != registeringListener || activeOwners.isEmpty()) return;
                        finishRegistrationCalls(null);
                    });
                } catch (RuntimeException error) {
                    host.runOnUiThread(() -> {
                        if (ownerGeneration == observerGeneration &&
                            listener == registeringListener) {
                            activeOwners.clear();
                            stopListener();
                        }
                    });
                }
            });
        } catch (RuntimeException error) {
            // Failed subscription must not leave a phantom observer owner.
            activeOwners.remove(ownerId);
            if (registrationPending) stopListener();
            else {
                stopListener();
                call.reject("Window topology observer unavailable: " + error.getMessage());
            }
        }
    }

    @PluginMethod
    public void stopObserving(PluginCall call) {
        onUiThread(call, () -> stopObservingOnUi(call));
    }
    private void stopObservingOnUi(PluginCall call) {
        String ownerId = call.getString("ownerId");
        if (ownerId == null || ownerId.isEmpty()) {
            call.reject("Fold observer ownerId is required");
            return;
        }
        activeOwners.remove(ownerId);
        if (registrationPending) {
            // A stopped owner cannot receive a successful late registration.
            // Other owners remain waiting for the same OEM subscription.
            for (int i = registrationCalls.size() - 1; i >= 0; i--) {
                PendingRegistration waiting = registrationCalls.get(i);
                if (ownerId.equals(waiting.ownerId)) {
                    registrationCalls.remove(i);
                    waiting.call.reject("Fold observer owner stopped before registration");
                }
            }
        }
        if (activeOwners.isEmpty()) stopListener();
        call.resolve();
    }

    // Only called on MAIN. Registration/removal can cross an OEM Binder;
    // never hold a synchronized monitor across either external call.
    private void stopListener() {
        if (registrationPending)
            finishRegistrationCalls("Fold observer stopped before registration");
        observerGeneration++;
        // An old Activity may stop after a new one registered. Only the
        // matching lease may report an observation gap to the recorder.
        if(observerLease!=null){
            NativeCaptureService.observeFoldObserverStopped(observerLease);
            // An old listener may stop AFTER a successor has registered.
            // Only a matching lease can invalidate the current native gate.
            if(disarmSurfaceLease(observerLease))
                NativeCapturePlugin.onFoldGeometryChanged();
            observerLease=null;
        }
        final WindowInfoTrackerCallbackAdapter removingAdapter = adapter;
        final Consumer<WindowLayoutInfo> removingListener = listener;
        listener = null;
        adapter = null;
        if (removingListener != null && removingAdapter != null) {
            // This queued removal runs AFTER a pending registration on the
            // same worker; a destroyed Activity cannot leak a stale listener.
            try {
                registrationWorker.execute(() -> {
                    try { removingAdapter.removeWindowLayoutInfoListener(removingListener); }
                    catch (RuntimeException ignored) { /* Stale Activity */ }
                });
            } catch (java.util.concurrent.RejectedExecutionException ignored) {
                Thread cleanup = new Thread(() -> {
                    try { removingAdapter.removeWindowLayoutInfoListener(removingListener); }
                    catch (RuntimeException ignoredAgain) { }
                }, "multicam-fold-cleanup");
                cleanup.setDaemon(true);
                cleanup.start();
            }
        }
        latest = null;
        lastNotifiedGeometry = null;
    }

    @Override
    protected void handleOnDestroy() {
        completeStateReads(null, "Fold Activity destroyed");
        activeOwners.clear();
        stopListener();
        registrationWorker.shutdown();
        super.handleOnDestroy();
    }
}
