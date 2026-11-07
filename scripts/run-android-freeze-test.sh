#!/usr/bin/env bash
set -euo pipefail
cd "$GITHUB_WORKSPACE"
ATTEMPT="${MULTICAM_SMOKE_ATTEMPT:-1}"
INFRA_MARKER="$GITHUB_WORKSPACE/android-emulator-infra-lost.txt"
rm -f "$INFRA_MARKER"
LOG_FILE="$GITHUB_WORKSPACE/android-freeze-emulator-logcat-${ATTEMPT}.txt"
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
trap 'kill "$LOGCAT_PID" 2>/dev/null || true' EXIT
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
  echo "INFRASTRUCTURE_LOST: virtual device disappeared; save logcat and retry on clean boot."
elif [ "$result" -ne 0 ]; then
  timeout 12 adb shell dumpsys gfxinfo app.lovable.multicampov framestats \
    > "$GITHUB_WORKSPACE/android-freeze-gfxinfo-${ATTEMPT}.txt" 2>&1 || true
  timeout 12 adb shell dumpsys activity processes \
    > "$GITHUB_WORKSPACE/android-freeze-processes-${ATTEMPT}.txt" 2>&1 || true
fi
exit "$result"
