import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Android native recovery for unresponsive or dead WebView renderer", () => {
  const activity = readFileSync("android/app/src/main/java/app/lovable/multicampov/MainActivity.java", "utf8");
  const monitor = readFileSync("android/app/src/main/java/app/lovable/multicampov/UiFreezeMonitor.java", "utf8");
  const capture = readFileSync("android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java", "utf8");

  it("handles terminated Chromium renderer using the Capacitor-aware WebViewClient", () => {
    expect(activity).toContain("new BridgeWebViewClient(bridge)");
    expect(activity).toContain("onRenderProcessGone(WebView view, RenderProcessGoneDetail detail)");
    expect(activity).toContain("((ViewGroup) parent).removeView(view)");
    expect(activity).toContain("view.destroy()");
    expect(activity).toContain("return true;");
    expect(activity).toContain("UiFreezeMonitor.recordRendererGone(detail.didCrash())");
  });

  it("provides a native dialog when Android MAIN runs but JavaScript heartbeat does not", () => {
    expect(activity).toContain("UiFreezeMonitor.setWebViewRecoveryListener(webViewRecovery)");
    expect(monitor).toContain("MAIN.post(() -> { if (foreground) recovery.run(); })");
    expect(activity).toContain('setPositiveButton("Перезапустить интерфейс"');
    expect(activity).toContain('"Подождать"');
    expect(activity).toContain("UiFreezeMonitor.setWebViewRecoveryListener(null)");
    expect(activity).not.toContain("System.exit");
    expect(activity).not.toContain("android.os.Process.killProcess");
    expect(activity).not.toContain("stopService(");
  });

  it("does not overwrite the diagnostic evidence or discard recording during restart", () => {
    expect(monitor).toContain("Manual recovery requested; previous report retained");
    expect(monitor).toContain("worker.shutdown();");
    expect(activity).not.toContain("deleteDatabase(");
    expect(activity).not.toContain("clearData(");
    expect(activity).toContain("Intent.FLAG_ACTIVITY_CLEAR_TASK");
  });

  it("measures available Android RAM and WebView version without accessing user content", () => {
    expect(monitor).toContain("getMemoryInfo(memory)");
    expect(monitor).toContain("WebView.getCurrentWebViewPackage()");
    expect(monitor).toContain("environmentEvidence()");
    expect(monitor).not.toContain("getExternalStorageDirectory(");
  });

  it("does not synchronously persist native capture failure audit from Service MAIN", () => {
    expect(capture).toContain('STATE_WRITER.execute(() =>\n                NativeCaptureAuditStore.append(auditContext, status(auditContext)))');
    const start = capture.indexOf('Android отказал в запуске службы камеры');
    const end = capture.indexOf('stopSelf(); return START_NOT_STICKY;', start);
    expect(start).toBeGreaterThan(-1);
    expect(capture.slice(start, end)).not.toContain('NativeCaptureAuditStore.append(this,status(this))');
  });
});
