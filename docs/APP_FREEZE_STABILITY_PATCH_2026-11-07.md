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
## Second safe media patch
- `src/lib/photo-stacking.ts` and `photo-stack-worker.ts`: full-resolution pixel accumulation with native Web Workers and a yielding fallback for older WebViews. The worker aborts, errors and times out safely rather than hanging navigation; user originals/frames/modes are preserved.
- `src/components/multicam/CameraPro.tsx`: night/long-exposure uses worker-based accumulation. Ordinary one-frame photos retain the exact existing draw+JPEG path.
- `src/lib/photo-frame-memory.test.ts`: independent exact arithmetic, worker/source contract and malformed-input regressions.
- This patch does **not** establish that the Settings GPU stall or other editor render stalls are fixed.


## 2026-11-07: root-cause narrowing from failed emulator smoke #157

Emulator run [#157](https://github.com/BauRP/project-resurrector/actions/runs/42380819869), SHA 99017c0b:
- swangle: Android MAIN blocked **7516ms** in `HardwareRenderer.nSyncAndDrawFrame` while camera was on screen, before the first Settings tap; 274 skipped UI frames; RAM available ~1.5GiB and Java heap ~4-5MiB. The Settings module was fetched during the same interval, and the native renderer stopped replying after `settings: body mounting after first paint`.
- swiftshader: instrumented run failed and the emulator disconnected; no proven single code cause for that outcome.
- This is **not** a Java OOM, and a successful release build is not a runtime pass. Two separate conditions remain possible: Android GPU draw stall and Chromium renderer starvation.

Stabilization without disabling features:
1. Native WebView no longer speculatively fetches or compiles Settings while camera/fold startup is busy. Desktop/browser warmup is unchanged; every Settings control still loads on demand.
2. The initial Settings shell paints theme/language first. The optional network/cache/Camera2 panels are scheduled in a **separate** turn after a 350ms wait and a two-paint (or 1.8s fallback) boundary; cancellation on unmount prevents stale work.
3. The 111/222 native app-shell paints the same multi-gradient `--reference-backdrop` **without two extra oversized composited pseudo-elements**. No camera/video/editor functionality, original media, fold data or settings buttons are removed.
4. Added/updated regressions for native preload suppression, staged paint and exact native gradient safety. Keep Android emulator smoke enabled; do not increase watchdog thresholds to conceal failures.

This is risk reduction, not proof of full freeze elimination; confirm in fresh independent emulator runtime tests. 
