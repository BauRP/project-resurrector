# Progress and verification — independent branch

This branch is isolated from `main`.

Implemented (code present):
- Responsive application shell for standard phones, tablets and large windows.
- Real Android Jetpack WindowManager fold-feature event source and Capacitor listener.
- Fold-state data with multiple hinge objects; unknown remains unknown.
- Diagnostic camera results distinguish unverified candidate resolutions/FPS from verified modes.
- Per-native-camera data including physical camera identifiers and minimum focus distance.
- UI indicates unavailable camera rather than presenting a simulated view as real camera.
- Capture controls read back actual applied geometry before updating the displayed selection.

NOT completed / NOT proven:
- Full 27-section camera acceptance matrix, individual per-mode persistent test passport, robust recording state machine, actual optical/physical lens selection and real dual camera pipeline.
- End-to-end recording persistence / error recovery and background recording.
- All camera focus/stabilization/HDR controls functioning on physical devices.
- Two/three-pane detailed layouts per fold posture: responsive large screen exists, hinge geometry is reported but not fully used for controls avoidance and pane partitioning.
- True application running preview / APK build is not verified in this execution context.
- Java/Android build and emulator/physical hardware tests must be run in Android CI.

Do not call this a completed implementation of either uploaded requirements document.
