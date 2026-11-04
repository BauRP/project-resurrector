package app.lovable.multicampov;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

/** Recovery diagnostics; never alters camera or recording. */
@CapacitorPlugin(name = "UiFreeze")
public class UiFreezePlugin extends Plugin {
    @PluginMethod public void trace(PluginCall call) {
        UiFreezeMonitor.traceAction(call.getString("action", ""));
        call.resolve();
    }
    @PluginMethod public void pulse(PluginCall call) {
        UiFreezeMonitor.webViewPulse();
        call.resolve();
    }
    @PluginMethod public void read(PluginCall call) {
        Context app = getContext().getApplicationContext();
        // SharedPreferences is capped at 4KB and does not touch camera state.
        new Thread(() -> {
            try {
                android.content.SharedPreferences preferences =
                    app.getSharedPreferences(UiFreezeMonitor.PREFS, Context.MODE_PRIVATE);
                JSObject out = new JSObject();
                out.put("report", preferences.getString(UiFreezeMonitor.REPORT, ""));
                out.put("recordedAt", preferences.getLong(UiFreezeMonitor.RECORDED_AT, 0L));
                call.resolve(out);
            } catch (Exception error) {
                call.reject("Журнал зависания недоступен: " + error.getMessage());
            }
        }, "multicam-freeze-report").start();
    }
    @PluginMethod public void clear(PluginCall call) {
        Context app = getContext().getApplicationContext();
        new Thread(() -> {
            try {
                app.getSharedPreferences(UiFreezeMonitor.PREFS, Context.MODE_PRIVATE)
                    .edit().remove(UiFreezeMonitor.REPORT)
                    .remove(UiFreezeMonitor.RECORDED_AT).apply();
                call.resolve();
            } catch (Exception error) {
                call.reject("Не удалось закрыть отчёт: " + error.getMessage());
            }
        }, "multicam-freeze-clear").start();
    }
}
