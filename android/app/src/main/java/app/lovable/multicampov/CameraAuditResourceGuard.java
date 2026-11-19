package app.lovable.multicampov;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Build;
import android.os.PowerManager;

/**
 * Cheap Android-only safety checks for a best-effort, resumable background
 * metadata job. Never blocks an existing recording, and never mistakes an
 * unavailable signal for proof that the device is healthy.
 */
final class CameraAuditResourceGuard {
    private CameraAuditResourceGuard() { }

    /** Returns a pause reason or null; no camera/media resource is opened. */
    static String pauseReason(Context context) {
        try {
            ActivityManager manager =
                    (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager != null) {
                ActivityManager.MemoryInfo memory = new ActivityManager.MemoryInfo();
                manager.getMemoryInfo(memory);
                if (memory.lowMemory) return "low-memory";
            }
        } catch (RuntimeException ignored) {
            // A missing signal must not be recorded as a hardware failure.
        }
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                PowerManager power =
                        (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                if (power != null &&
                        power.getCurrentThermalStatus() >= PowerManager.THERMAL_STATUS_SEVERE)
                    return "thermal-severe";
            } catch (RuntimeException ignored) {
                // An OEM throwing on thermal status does not imply overheating.
            }
        }
        return null;
    }
}
