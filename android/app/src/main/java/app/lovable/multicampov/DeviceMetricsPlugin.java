package app.lovable.multicampov;

import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import android.os.StatFs;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

/** Non-blocking Android battery and free-storage reporting.
 * Unlike navigator.getBattery(), BatteryManager is available in native APKs.
 */
@CapacitorPlugin(name = "DeviceMetrics")
public class DeviceMetricsPlugin extends Plugin {
    // A JavaScript timeout does not cancel an OEM battery/storage call.
    // Reject queue buildup, but keep returning the last actual measurements.
    private final java.util.concurrent.atomic.AtomicBoolean readInFlight =
        new java.util.concurrent.atomic.AtomicBoolean(false);
    private volatile Integer lastBattery = null;
    private volatile Long lastStorageMB = null;

    private JSObject cachedMetrics() {
        JSObject result = new JSObject();
        Integer battery = lastBattery;
        Long storage = lastStorageMB;
        result.put("battery", battery == null ? org.json.JSONObject.NULL : battery);
        result.put("storageMB", storage == null ? org.json.JSONObject.NULL : storage);
        return result;
    }
    private final java.util.concurrent.ExecutorService worker =
        java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
            Thread thread = new Thread(r, "multicam-device-metrics");
            thread.setDaemon(true);
            return thread;
        });

    @PluginMethod
    public void read(PluginCall call) {
        if (!readInFlight.compareAndSet(false, true)) {
            call.resolve(cachedMetrics());
            return;
        }
        final Context context = getContext().getApplicationContext();
        try {
            worker.execute(() -> {
                try {
                    Integer percent = null;
                    Intent battery = context.registerReceiver(null,
                        new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
                    if (battery != null) {
                        int level = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                        int scale = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
                        if (level >= 0 && scale > 0)
                            percent = Math.min(100, Math.max(0, Math.round(level * 100f / scale)));
                    }
                    Long storageMB = null;
                    StatFs fs = new StatFs(context.getFilesDir().getAbsolutePath());
                    long available = fs.getAvailableBytes();
                    if (available >= 0) storageMB = available / (1024L * 1024L);

                    lastBattery = percent;
                    lastStorageMB = storageMB;
                    call.resolve(cachedMetrics());
                } catch (Exception error) {
                    // A temporary OEM failure must not erase the last reading.
                    call.resolve(cachedMetrics());
                } finally {
                    readInFlight.set(false);
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException error) {
            readInFlight.set(false);
            call.resolve(cachedMetrics());
        }
    }

    @Override protected void handleOnDestroy() {
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
