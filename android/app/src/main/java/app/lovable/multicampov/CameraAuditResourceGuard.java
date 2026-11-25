package app.lovable.multicampov;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
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
        try {
            // A sticky snapshot requires no long-lived receiver or extra
            // permission. Missing/invalid OEM values are not low battery.
            Intent battery = context.registerReceiver(null,
                    new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (battery != null) {
                int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                int plugged = battery.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1);
                if (level >= 0 && scale > 0 && level <= scale && plugged == 0 &&
                        100L * level < 15L * scale) return "low-battery";
            }
        } catch (RuntimeException ignored) {
            // No confirmed battery information; preserve the existing budget.
        }
        return null;
    }
}
