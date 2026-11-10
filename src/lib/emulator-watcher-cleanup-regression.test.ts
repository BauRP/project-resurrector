import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
describe("GitHub emulator smoke watcher does not outlive instrumentation", () => {
  const script = readFileSync("scripts/run-android-freeze-test.sh", "utf8");
  it("terminates log follow when the parent script exits", () => {
    expect(script).toContain('WATCH_PARENT_PID="$BASHPID"');
    expect(script).toContain('tail --pid="$WATCH_PARENT_PID" -n 0 -F "$LOG_FILE"');
    expect(script).toContain('kill "$LOGCAT_PID" "$STACK_WATCHER_PID"');
  });
  it("keeps the background watcher off the Android runner action stdout pipe", () => {
    expect(script).toContain(') </dev/null >"$GITHUB_WORKSPACE/android-freeze-stack-watcher-${ATTEMPT}.txt" 2>&1 &');
    expect(script).toContain('exit "$result"');
    const workflow = readFileSync(".github/workflows/android_emulator_freeze_smoke.yml", "utf8");
    expect(workflow).toContain("android-freeze-stack-watcher-*.txt");
  });
});
