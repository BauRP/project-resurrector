package app.lovable.multicampov;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;

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
    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(new JSObject().put("audit", CameraAuditService.read(getContext())));
    }

    @PluginMethod
    public void startIfNeeded(PluginCall call) {
        // The caller opens the app explicitly before requesting CAMERA permission.
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissionForAlias("camera", call, "onAuditPermission");
            return;
        }
        startIfReady(call);
    }

    @PermissionCallback
    private void onAuditPermission(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            call.resolve(new JSObject().put("started", false).put("reason", "camera-permission-denied"));
            return;
        }
        startIfReady(call);
    }

    private void startIfReady(PluginCall call) {
        if (CameraAuditService.inventoryComplete(getContext())) {
            call.resolve(new JSObject().put("started", false).put("reason", "already-complete"));
            return;
        }
        try {
            // This is a short metadata scan, not camera capture. Do not claim
            // it is an unrestricted foreground/background recording service.
            Intent intent = new Intent(getContext(), CameraAuditService.class);
            getContext().startService(intent);
            call.resolve(new JSObject().put("started", true));
        } catch (Exception error) {
            call.resolve(new JSObject().put("started", false).put("reason",
                    error.getClass().getSimpleName()));
        }
    }
}
