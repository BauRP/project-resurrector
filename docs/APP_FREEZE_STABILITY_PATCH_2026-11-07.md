# Android freeze stabilization — 2026-11-07

**Mode:** urgent stability-only remediation. Both camera and fold technical specifications remain PAUSED. Existing Camera2, native preview, independent/dual recording, editing, original media, and fold adaptivity must remain intact. The measured C/F scenario coverage is unchanged (91.86%, 76.39%, combined 84.81%).

## Runtime evidence (actual owner-provided emulator artifacts)

- Emulator evidence #143: Android UI thread inside `android.graphics.HardwareRenderer.nSyncAndDrawFrame` for 7501 ms following Settings entry. Java heap ~10/192 MiB; the observed stack is graphics draw, not a demonstrated Java OOM.
- Later swangle #150: Settings rendered, but WebView stopped replying during click back to Camera. Android MAIN was idle at `MessageQueue.nativePollOnce`; a JS/WebView renderer stall differs from Android UI-thread deadlock.
- Android APK builds pass despite these emulator failures. Treat build and runtime verdicts separately.

## Direct code fixes

- **NativeCaptureService.java:** WindowManager-fold recording evidence and observer gap updates are snapshotted while the recording lock is held and persisted through the existing serial `STATE_WRITER` outside Android MAIN. No field, original clip, or fold callback is dropped.
- **DisplayTopologyPlugin.java:** genuine WindowManager state is still processed under the monitor, but `notifyListeners` is invoked outside that monitor, preventing JS bridge work while holding the topology lock.
- Regression tests assert the actual source contract rather than claiming a real-device pass.
- New independent stabilization branch based on latest `main`, no history rewrite. New smoke CI branch filters include this branch.

## Still not yet established by this patch

- Root cause of the Settings compositor stall and return-to-Camera WebView hang.
- Editor full-file audio decode and simultaneous video-decoder budget; require separate measured fixes.
- Real-device freeze-free acceptance; not a coding-only deliverable. No unchecked performance claim.

Run full Bun tests, TypeScript, Android APK/AAB CI and both official emulator GPU smoke jobs. Record exact outcomes after Actions completes.