package app.lovable.multicampov;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Fast bridge to a separate-process, read-only camera inventory.
 * The bridge never waits for CameraManager or JSON disk writes.
 */
@CapacitorPlugin(name = "CameraAudit", permissions = {
        @Permission(alias = "camera", strings = {Manifest.permission.CAMERA})
})
public final class CameraAuditPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor(r -> {
        Thread thread = new Thread(r, "multicam-audit-bridge-io");
        thread.setDaemon(true);
        return thread;
    });
    @PluginMethod
    public void getStatus(PluginCall call) {
        io.execute(() -> {
            JSObject result = new JSObject();
            result.put("audit", CameraAuditService.read(getContext()));
            call.resolve(result);
        });
    }

    @PluginMethod
    public void startIfNeeded(PluginCall call) {
        // The caller opens the app explicitly before requesting CAMERA permission.
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("camera", call, "onAuditPermission");
            return;
        }
        io.execute(() -> startIfReady(call));
    }

    @PermissionCallback
    private void onAuditPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            JSObject denied = new JSObject();
            denied.put("started", false);
            denied.put("reason", "camera-permission-denied");
            call.resolve(denied);
            return;
        }
        io.execute(() -> startIfReady(call));
    }

    private void startIfReady(PluginCall call) {
        if (CameraAuditService.inventoryComplete(getContext())) {
            JSObject complete = new JSObject();
            complete.put("started", false);
            complete.put("reason", "already-complete");
            call.resolve(complete);
            return;
        }
        try {
            // This is a short metadata scan, not camera capture. Do not claim
            // it is an unrestricted foreground/background recording service.
            Intent intent = new Intent(getContext(), CameraAuditService.class);
            getContext().startService(intent);
            JSObject started = new JSObject();
            started.put("started", true);
            call.resolve(started);
        } catch (Exception error) {
            JSObject failed = new JSObject();
            failed.put("started", false);
            failed.put("reason", error.getClass().getSimpleName());
            call.resolve(failed);
        }
    }

    @Override protected void handleOnDestroy() {
        io.shutdown();
        super.handleOnDestroy();
    }
}
