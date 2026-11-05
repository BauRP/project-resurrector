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
./gradlew connectedDebugAndroidTest --no-daemon --stacktrace \
  -Pandroid.testInstrumentationRunnerArguments.class=app.lovable.multicampov.MulticamFreezeNavigationInstrumentedTest
