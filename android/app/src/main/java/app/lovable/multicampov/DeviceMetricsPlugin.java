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
    private final java.util.concurrent.ExecutorService worker =
        java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
            Thread thread = new Thread(r, "multicam-device-metrics");
            thread.setDaemon(true);
            return thread;
        });

    @PluginMethod
    public void read(PluginCall call) {
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

                    JSObject data = new JSObject();
                    data.put("battery", percent == null ? org.json.JSONObject.NULL : percent);
                    data.put("storageMB", storageMB == null ? org.json.JSONObject.NULL : storageMB);
                    call.resolve(data);
                } catch (Exception error) {
                    call.reject("Показатели устройства недоступны: " + error.getMessage());
                }
            });
        } catch (java.util.concurrent.RejectedExecutionException error) {
            call.reject("Android закрывает мониторинг устройства");
        }
    }

    @Override protected void handleOnDestroy() {
        worker.shutdownNow();
        super.handleOnDestroy();
    }
}
