import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const service = readFileSync("android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java", "utf8");
describe("Camera2 state lock never waits for initial journal disk load", () => {
  it("loads persisted status before acquiring the lock used by Android MAIN", () => {
    const start = service.indexOf("public static com.getcapacitor.JSObject status(Context context)");
    const end = service.indexOf("private void publish(", start);
    const method = service.slice(start, end);
    const preLock = method.slice(0, method.indexOf("synchronized (STATE_LOCK)"));
    expect(preLock).toContain("context.getSharedPreferences(STORE, MODE_PRIVATE)");
    expect(method).toContain('value = preferences.getString("state", "idle")');
    expect(method).not.toContain("synchronized (STATE_LOCK) {\n            android.content.SharedPreferences preferences =");
  });
  it("creates the state editor before locking but queues the durable write in order", () => {
    const start = service.indexOf("private void publish(");
    const end = service.indexOf("@Override public void onCreate()", start);
    const method = service.slice(start, end);
    const preLock = method.slice(0, method.indexOf("synchronized (STATE_LOCK)"));
    expect(preLock).toContain("getSharedPreferences(STORE, MODE_PRIVATE).edit()");
    expect(method).toContain('stateEditor.putString("state", newState)');
    expect(method).toContain("STATE_WRITER.execute(() ->");
    expect(method).toContain("stateEditor.commit()");
    expect(method).toContain("stateEditor.apply()");
  });
});
