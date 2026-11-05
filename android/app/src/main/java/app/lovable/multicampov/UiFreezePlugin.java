package app.lovable.multicampov;

import android.content.Context;
import android.content.ClipData;
import android.content.ClipboardManager;

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
    /** Clipboard is handled by Android instead of document.execCommand("copy").
     * The latter synchronously creates/selects DOM while a WebView renderer is
     * already recovering from an ANR and can lock up that renderer again.
     * Do not clear the saved report just because copy succeeded.
     */
    @PluginMethod public void copyReport(PluginCall call) {
        String report = call.getString("report", "");
        if (report == null || report.isEmpty() || report.length() > 4096) {
            call.reject("Нет отчёта для копирования");
            return;
        }
        getActivity().runOnUiThread(() -> {
            try {
                ClipboardManager clipboard = (ClipboardManager)
                    getContext().getSystemService(Context.CLIPBOARD_SERVICE);
                if (clipboard == null) {
                    call.reject("Буфер обмена Android недоступен");
                    return;
                }
                clipboard.setPrimaryClip(ClipData.newPlainText(
                    "MULTI-CAM POV: журнал зависания", report));
                call.resolve();
            } catch (Exception error) {
                call.reject("Не удалось скопировать отчёт: " + error.getMessage());
            }
        });
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
