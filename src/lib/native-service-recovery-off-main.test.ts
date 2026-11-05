import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const service = readFileSync("android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java","utf8");

describe("NativeCaptureService never recovers persisted files on Android MAIN", () => {
  it("starts the worker before enqueueing old recording recovery", () => {
    const onCreate = service.slice(service.indexOf("@Override public void onCreate()"), service.indexOf("private Notification notification()"));
    expect(onCreate).toContain('new HandlerThread("Native-Camera2-Record")');
    expect(onCreate).toContain("worker.post(() -> {");
    expect(onCreate).toContain("recoverAbandonedRecording(this, this)");
    expect(onCreate).not.toContain("recoverAbandonedRecording(this);");
    expect(onCreate.indexOf("workerThread.start()")).toBeLessThan(onCreate.indexOf("recoverAbandonedRecording(this, this)"));
    expect(onCreate).toContain("recoveryReady = true");
  });

  it("replays start/stop after recovery without waiting synchronously in onStartCommand", () => {
    const start = service.slice(service.indexOf("@Override public int onStartCommand("), service.indexOf("private void startPreview(Intent intent)"));
    expect(start).toContain("if (!recoveryReady)");
    expect(start).toContain("worker.post(() -> {");
    expect(start).toContain("onStartCommand(pendingIntent, flags, startId)");
    expect(start).not.toContain("await()");
    expect(start).not.toContain("CountDownLatch");
  });

  it("never holds the shared camera state lock around slow recovery SharedPreferences commits", () => {
    const start = service.indexOf("private static void recoverAbandonedRecording(Context context, NativeCaptureService permittedOwner)");
    const end = service.indexOf("public static void observeFoldObserverActive(", start);
    const block = service.slice(start, end);
    expect(block).toContain("synchronized (RECOVERY_LOCK)");
    expect(block).toContain("if (runningInstance != null && runningInstance != permittedOwner) return;");
    expect(block).toContain(".commit()");
    expect(block).toContain("NativeCaptureAuditStore.append(context,recovered)");
    expect(block.indexOf("synchronized (STATE_LOCK)")).toBeLessThan(block.indexOf("context.getSharedPreferences(STORE, MODE_PRIVATE)"));
    const preIO = block.slice(0, block.indexOf("context.getSharedPreferences(STORE, MODE_PRIVATE)"));
    expect(preIO).toContain("synchronized (STATE_LOCK)");
    expect(preIO).toContain("if (permittedOwner != null && permittedOwner.serviceDestroyed) return;");
  });
});
