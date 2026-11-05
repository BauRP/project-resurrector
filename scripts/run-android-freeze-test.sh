#!/usr/bin/env bash
set -euo pipefail
cd "$GITHUB_WORKSPACE"
# Stream Android logcat throughout the actual emulator run, not only after
# completion; emulator process can die before a final "adb logcat -d".
adb logcat -v threadtime > "$GITHUB_WORKSPACE/android-freeze-emulator-logcat.txt" 2>&1 &
LOGCAT_PID=$!
trap 'kill "$LOGCAT_PID" 2>/dev/null || true' EXIT
cd "$GITHUB_WORKSPACE/android"
chmod +x ./gradlew
# Run the REAL crash path, not a trivial default package-name example.
# Preserve the failing instrumentation assertion in the GitHub log even
# when Android Emulator disconnects during Gradle's post-test cleanup.
set +e
./gradlew connectedDebugAndroidTest --no-daemon --stacktrace \
  -Pandroid.testInstrumentationRunnerArguments.class=app.lovable.multicampov.MulticamFreezeNavigationInstrumentedTest
result=$?
set -e
echo "===== Android instrumentation evidence (exit: $result) ====="
find "$GITHUB_WORKSPACE/android/app/build/outputs/androidTest-results" \
     "$GITHUB_WORKSPACE/android/app/build/reports/androidTests" \
     -type f \\( -name '*.xml' -o -name '*.html' \\) 2>/dev/null \
     | while IFS= read -r report; do
       case "$report" in
         *.xml)
           echo "===== $report ====="
           grep -E -m 22 '<(failure|error|testcase|testsuite)' "$report" || true
           ;;
       esac
     done
echo "===== Final emulator status ====="
adb devices -l || true
exit "$result"
