#!/usr/bin/env bash
set -euo pipefail
cd "$GITHUB_WORKSPACE"
ATTEMPT="${MULTICAM_SMOKE_ATTEMPT:-1}"
INFRA_MARKER="$GITHUB_WORKSPACE/android-emulator-infra-lost.txt"
rm -f "$INFRA_MARKER"
LOG_FILE="$GITHUB_WORKSPACE/android-freeze-emulator-logcat-${ATTEMPT}.txt"
# Only the separately labelled compact comparison changes emulator pixels.
# It does not alter application rendering, WebView flags or Android features.
# All existing full-resolution tests remain mandatory.
if [[ "${MULTICAM_EMULATOR_RESOLUTION:-full}" == "compact" ]]; then
  timeout 12 adb shell wm size 540x1200
  timeout 12 adb shell wm density 240
fi
HOST_FILE="$GITHUB_WORKSPACE/android-freeze-host-${ATTEMPT}.txt"
{
  echo "===== Host and emulator before test, attempt $ATTEMPT ====="
  date -u
  uname -a
  free -m
  df -h "$GITHUB_WORKSPACE"
  adb devices -l
} > "$HOST_FILE" 2>&1 || true
# Stream logs before the test. If the virtual device dies, its last logcat
# output still survives on the GitHub runner for investigation.
adb logcat -v threadtime > "$LOG_FILE" 2>&1 &
LOGCAT_PID=$!
# Collect Chromium and UI thread evidence WHILE the test still owns its
# WebView. Gradle tears down the Activity after failure, so a post-test
# debuggerd command is usually too late. Capture is bounded and best-effort.
STACK_FILE="$GITHUB_WORKSPACE/android-freeze-renderer-stacks-${ATTEMPT}.txt"
(
  tail -n 0 -F "$LOG_FILE" | while IFS= read -r line; do
    if [[ "$line" == *"MultiCamFreezeTest: WebView did not reply"* ]]; then
      {
        echo "===== V8 JavaScript call stack from debug-only WebView ====="
        timeout 11 node "$GITHUB_WORKSPACE/scripts/capture-webview-cdp.mjs" || true
        echo "===== Live Android threads when WebView callback stalled ====="
        date -u
        timeout 4 adb shell ps -A -o PID,NAME || true
        timeout 4 adb shell dumpsys meminfo app.lovable.multicampov || true
        timeout 6 adb shell dumpsys gfxinfo app.lovable.multicampov framestats || true
        # On userdebug Google APIs images, debuggerd can capture blocked
        # native renderer stacks. Production-image restrictions are expected.
        RENDERER_PID="$(timeout 3 adb shell ps -A -o PID,NAME 2>/dev/null |
          awk '/webview:sandboxed_process/{print $1; exit}' | tr -d '\r' || true)"
        if [[ "$RENDERER_PID" =~ ^[0-9]+$ ]]; then
          timeout 8 adb shell debuggerd -b "$RENDERER_PID" || true
        fi
      } > "$STACK_FILE" 2>&1
      break
    fi
  done
) &
STACK_WATCHER_PID=$!
trap 'kill "$LOGCAT_PID" "$STACK_WATCHER_PID" 2>/dev/null || true' EXIT
cd "$GITHUB_WORKSPACE/android"
chmod +x ./gradlew
set +e
./gradlew connectedDebugAndroidTest --no-daemon --stacktrace \
  -Pandroid.testInstrumentationRunnerArguments.class=app.lovable.multicampov.MulticamFreezeNavigationInstrumentedTest
result=$?
set -e
echo "===== Instrumentation evidence (exit: $result, attempt $ATTEMPT) ====="
(find "$GITHUB_WORKSPACE/android/app/build/outputs/androidTest-results" \
     "$GITHUB_WORKSPACE/android/app/build/reports/androidTests" \
     -type f -name '*.xml' 2>/dev/null || true) \
  | while IFS= read -r report; do
      echo "===== $report ====="
      grep -E -m 22 '<(failure|error|testcase|testsuite)' "$report" || true
    done
{
  echo "===== Host and emulator after test ====="
  date -u
  free -m
  ps -eo pid,comm,rss --sort=-rss | head -n 25
  adb devices -l
  echo "===== Emulator/ADB host process snapshot ====="
  ps -ef | grep -E '[q]emu-system|[e]mulator|[a]db' || true
  echo "===== Recent kernel messages for host OOM/GPU exits ====="
  (sudo dmesg --ctime 2>/dev/null | tail -n 90 || true)
} >> "$HOST_FILE" 2>&1 || true
# Only classify as infrastructure when ADB cannot reach the device AND
# there is no explicit WebView assertion. Never mask a real application hang.
APP_FAILURE=0
if grep -q 'WebView did not reply\|WebView did not display' \
    "$GITHUB_WORKSPACE"/android/app/build/outputs/androidTest-results/connected/debug/TEST-*.xml 2>/dev/null; then
  APP_FAILURE=1
fi
if [ "$result" -ne 0 ] && [ "$APP_FAILURE" -eq 0 ] && \
    ! timeout 12 adb -s emulator-5554 shell 'echo alive' >/dev/null 2>&1; then
  echo "Emulator disappeared from ADB; app failure not proven; attempt $ATTEMPT" > "$INFRA_MARKER"
  { echo "===== Emulator disappearance evidence ====="
    ps -ef | grep -E '[q]emu-system|[e]mulator|[a]db' || true
    sudo dmesg --ctime 2>/dev/null | tail -n 160 || true
  } >> "$HOST_FILE" 2>&1
  echo "INFRASTRUCTURE_LOST: virtual device disappeared; save logcat and retry on clean boot."
elif [ "$result" -ne 0 ]; then
  timeout 12 adb shell dumpsys gfxinfo app.lovable.multicampov framestats \
    > "$GITHUB_WORKSPACE/android-freeze-gfxinfo-${ATTEMPT}.txt" 2>&1 || true
  timeout 12 adb shell dumpsys activity processes \
    > "$GITHUB_WORKSPACE/android-freeze-processes-${ATTEMPT}.txt" 2>&1 || true
fi
exit "$result"
