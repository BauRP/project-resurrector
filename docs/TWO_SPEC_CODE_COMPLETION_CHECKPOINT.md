# MULTI-CAM POV — code-completion checkpoint, 2026-11-01

**Authoritative working branch:** `chatgpt/independent-preview-20261023`, repo `BauRP/project-resurrector`. **Never merge or change `main` without user approval.**

**Requirements:** original `MULTI-CAM-POV_Обнаружение камер и проверка` (27 chapters, 1,352 lines in the user's file) and `СДелать Раскладушки` (14 sections, 783 lines). Source requirements are user-provided, not new GitHub files.

**Measurement:** do NOT advertise the historical 99.45% / 99.9985% as a measured completion fraction. The full requirement-to-code-to-test map has not been closed. Do not include physical-device acceptance in the user's code-only completion target. A successful APK build proves compilation/tests, not physical camera or fold behavior.

## Verified base and new changes

- Base commit `6b3062538611282a6b933e6203b3b5f276455be9`: CI #1019 successful, all workflow jobs including release APK/AAB publication.
- `9dbd764f6fd8c15b5a4bccf36669979481b9fef1`: offline/disconnected camera queue entries no longer reuse persisted `verified` or `recorded` status without current per-mode passport evidence. An interrupted `running` task becomes deferred. Tests added in `src/lib/camera-test-queue.test.ts`.
- `3b6a2e7ec3c55a6d5ccf47960d2ba683854d3df2`: invalid fold window measurements invalidate old pane CSS values and the active WebView fold baseline; direct Android TextureView is hidden until actual geometry is available. Source-contract test added.
- `11daac395713b1eadea5c785173c4dcc44368dbd`: updated source regression assertion after adding fold guard; CI #1022 to be checked before any success claim.
- CI #1020 confirmed successful for the camera patch. CI #1021 failed only an outdated source string assertion; #1022 unit tests, TypeScript, WebView build and Capacitor sync passed at checkpoint; release Gradle result was still pending at observation.

## Outstanding *programmatic* requirement groups — action ledger

The labels below mean **not yet fully audited and closed against the entire TЗ**, NOT a blanket assertion that the feature is absent. Existing code must be reused and not rewritten speculatively.

### Camera specification
1. §§1–3 — first-run staged diagnosis, states for declared/API/applied/verified/unknown, operation-generation cancellation, resource release, resumption, denied permissions. Inspect `SplashScreen.tsx`, `CameraDiagnostics.tsx`, `camera-controller.ts`, `camera-passport.ts` and add an end-to-end test for interruption/restart (current source/unit tests alone are partial).
2. §§4–5 — logical/physical/external lens identification and dynamic availability; actual per-lens Camera2/WebView mode combinations, stream/coder restrictions and hard-handoffs. Compare `MultiCamNativePlugin.java`, `mode-verification.ts`, `native-mode-selection.ts`, `camera-test-queue.ts` against all required statuses. Do not infer WebView deviceId from Camera2 ID.
3. §§6–8 — focus/face/color/exposure, OIS/EIS/software-stabilization selection per mode; keep requested/applied/CaptureResult/MP4 evidence separate. Review `CameraPro.tsx`, `NativeCaptureService.java`, `stabilization-policy.ts`, `stabilization-probe.ts` and add behavioral tests where absent.
4. §§9–10 — HDR/LOG/codec validity, encoder/recording shutdown, persisted MP4 sample/timeline/audio checks, background/lock/process-death recovery. Review native service, `NativeMp4TimelineAudit.java`, `NativeCaptureAuditStore.java` and `native-recorded-mode-evidence.ts`. Do not label incomplete encoded output `verified`.
5. §§11–17 — photo/RAW/front lens, touch/zoom, external microphones, thermal/storage/resource budget, incompatible features, multiple simultaneous cameras. Cross-check existing separate capture paths and permission fallbacks with tests, not just buttons.
6. §§18–23 — multi-phone sessions/network loss; unique camera owner; persisted per-mode passport freshness; audit export privacy; UI reporting and start-time unsafe-mode warning. Check `mesh.ts`, `ConnectModal.tsx`, `camera-passport.ts`, `CameraDiagnostics.tsx`.
7. §§24–27 and acceptance §25 — verify required edits in each named screen and correlate **all 43 camera acceptance scenarios** with source and executable test. Source proof must list exact method, CI run and cases. Physical checks remain future work.

### Foldable/multi-display specification
1. §§1–4 — actual closed/open/half-open/tri-fold/dual-screen/outward/windowed topology without manufacturer-guess heuristics; compare WindowManager state, multiple physical hinges and available app-window geometry.
2. §5 — bridge lifecycle, revisions, evidence provenance, measured webViewBounds and insets, Activity recreation, listener cleanup (native `DisplayTopologyPlugin.java`).
3. §§6–8 — compact, medium, expanded, two-pane, three-pane, tabletop, quad camera controls; safe preview/touch transforms, short landscape windows, system bars, keyboard, large fonts. Audit *all screens*, not camera only.
4. §9 — recording and fold/unfold are independent lifecycles. Review Camera2 foreground ownership, rebind timing, pause/recovery and encoder finalization without false continuation.
5. §§10–12 — native/DOM safe regions, physical gaps, window resizing/multi-display callbacks, independent pane scroll, accessibility and no scroll-to-top, no excessive re-renders/listener leaks.
6. §§13–14 — map the **36 listed fold scenarios**, device/reference geometry, UI coverage, acceptance criteria, and exportable logs to source test evidence. No invented intermediate display modes or unsupported APK availability.

## Exact next actions

1. Inspect **CI #1022** (run `41306787708`). If failing, read failing job logs and fix in the same dedicated branch. If passing, record the SHA and success.
2. Add a behavior-level invalid-geometry regression that checks source/DOM topology reset, not merely the presence of a string. Investigate duplicate native fold callback cleanup and state changes across Activity recreation.
3. Audit camera first-run progress and startup: compare stages against §3 of camera ТЗ, check proof-carrying queue recovery after stale WebView/API revision, and add a targeted test for pending/deferred/old-proof entries.
4. Audit editors, connections, QR, gallery, export, permission dialogs, keyboard and large system fonts against fold §11: fix the first confirmed nonadaptive screen; then add regression tests.
5. Continue requirements one by one, with separate commits/test passes. Never reassign a numeric readiness percentage without an explicit counted requirements ledger.

**No hourly automation.** No asynchronous promise: this file persists the continuation point for an interactive future session if the current technical session ends.

## Current interactive session continuation — 2026-11-01, second batch

- CI **#1022** on `11daac39` succeeded; #1023 on checkpoint `e38e3232` succeeded.
- Camera specification §3: `8631accb`, `4bac7cfd` add startup-probe abort generation and prevent a late completed probe from overwriting the current capability cache after splash timeout/unmount. `22356124`, `690b0863` also gate fallback camera/mic and per-lens probe attempts after cancellation; source contract tests included.
- Foldable specification §§5,9,12: `5333bdbe`, `77ea52d5` invalidate pane/TextureView geometry when a newly reported Activity has zero/nonfinite window dimensions. Stale lower revisions are ignored first; no camera recorder shutdown is introduced.
- CI **#1025** on startup-splash changes succeeded; newest code SHA before this checkpoint: `77ea52d53f1fafbb5163cf83e5b2c709e5d2db4c`. **CI #1029** (run `41307488280`) was running when the checkpoint was started. Check its final conclusion; do not assume success from unit tests alone.
- Prior camera/fold commits: `9dbd764f` invalidates stale offline camera `verified` labels without current passport evidence; `3b6a2e7e` resets untrusted WindowManager geometry; `11daac39` corrects a source-contract test; all validated through successful CI #1022/#1023.
- Remaining software work is **not finished**. Highest priority after inspecting CI #1029: check true start-up cancellation across permission denials and delayed getUserMedia (an actual behavior-level test is still missing), then verify and implement first-run staged auto-diagnostics and resumable mode queue against §3. Follow with fold-wide coverage of editor, QR/pairing, gallery, export, dialogs, TalkBack/large fonts, and lifecycle-recreation tests. The earlier category-by-category requirement ledger above remains authoritative; review it against each actual function rather than claiming blanket implementation.
- Device acceptance is intentionally deferred, per the user's explicit request. **No completion percentage can be substantiated without a full per-requirement code/CI accounting**; historical reported 99.x numbers must not be increased or represented as measured completion.
- **No automation or timed background execution is enabled.** Only active chat tool calls can proceed. Never edit `main` or merge without user consent.

## Interactive work continuation — 2026-11-01, current batch

- Starting HEAD `0a8a465850d1984b683cab5bcb62384817e4d60f`, with CI #1030 successful.
- Camera §3 and camera acceptance (single usable video source): `a1fa7038` now requires a **live MediaStreamTrack** before startup probe says a camera is available. An OEM `getCapabilities`/`getSettings` exception returns unknown/unavailable instead of inventing support; the stream is released in finally. Three actual mock MediaStream behavior tests added. `830d343a` repaired a missing closing brace caught by CI #1031. CI #1033 subsequently passed Vitest and TypeScript; Gradle/release was still running at documentation time.
- Foldable §§5,11 (QR/pairing modal): `8550bb43` restricts the ConnectModal interactive overlay to the **measured** usable fold workspace instead of spanning an occluding physical hinge. It also provides small-height layout and word-wrap. This uses `--fold-work-left`/`--fold-work-width`, not a device model heuristic. Added `fold-modal-placement.test.ts` source contract. This does not establish actual folding-device UI/QR behavior.
- No changes were made to main, no background timer/automation created.
- **Next exact action:** check successful/failed final CI #1033 (`41308603587`) and fix any Android failures. Then audit `EditorTab.tsx` export panel and `SettingsTab.tsx` privacy overlay under fold-safe regions and small/short windows (fold TЗ §11). For camera TЗ, investigate persistence freshness and exceptions in startup before considering it fully closed. Correlate each piece of source/CI evidence with the 43 camera and 36 fold acceptance scenarios; do not claim blanket closure of either TЗ or fake readiness percentages.

## Interactive continuation — 2026-11-01, verified batch #1035

- Before batch: `0a8a4658` successful CI #1030.
- Camera startup §3: `a1fa7038` implemented live-track requirement, exception-safe capability getter, and deterministic stream close, with 3 mocked getUserMedia behavior tests in `capabilities-runtime.test.ts`. `830d343a` corrected a TypeScript brace omission detected in CI #1031. **CI #1033 passed**, including APK/AAB.
- Foldable §11: `8550bb43` placed QR/connection modal into actual measured usable fold pane; `95e9c62f` applied measured pane constraints to editor export and settings privacy overlays. Tests in `fold-modal-placement.test.ts` and `fold-fullscreen-overlays.test.ts`. **CI #1035 passed**, including release APK/AAB. These tests are CSS/source contract tests, not real-device rendering.
- Latest tested implementation SHA: `95e9c62fe8ab676eb525a20c5242ddcf758bd2d8`, CI run `41308811798`. No changes to main.
- Correct measured readiness delta for the complete 43 camera / 36 fold requirement suites is NOT YET COMPUTABLE: the outstanding requirement-by-requirement audit still lacks full evidence. Do not increment old historical 99% values without a counted denominator. For this *batch only*, three targeted code changes have source/CI coverage; no physical-device outcomes.
- Next task: inspect `EditorPro.tsx`, `CameraTab.tsx`, connection window/QR video viewport, and global modal overlays for resized-window keyboard+hinge reachability. Audit `capabilities.ts` startup for permission-state accuracy and the delayed `getUserMedia` cancellation resource-release path. Update requirement/CI ledger with evidence; then commit and verify new tests. User explicitly requested no scheduled automation.

## Current session implementation checkpoint — 2026-11-01, QR capture and lens identity

- Branch: `chatgpt/independent-preview-20261023` only; `main` untouched. Base `5f5d0e3f` had green CI #1036.
- Commit `aa10c3ae106ef1c8f71d229706338b34e65685ad`: QR pairing `Scanner` in `ConnectModal.tsx` no longer calls getUserMedia directly. It acquires the shared `cameraController` with `preempt:false`, so it cannot silently take an active camera lease. On successful QR detection, error, or unmount, it releases its own owner only; added ownership unit tests. Also fixed invalid `min(100dvh - 2rem,...)` CSS for short folded dialog heights. CI #1037 `41316340200` succeeded, including Android APK/AAB.
- Commit `317c63e60f2fd93dc9389395c319e247c9709353`: startup `probeCamera` checks actual `getSettings().facingMode` and rejects mistakenly assigned front-as-rear / rear-as-front records. New behavior test in `capabilities-runtime.test.ts`. CI #1038 `41316487708` was running at checkpoint; unit tests, TypeScript, and Capacitor sync had passed. Inspect final result before marking the commit validated.
- Source audits completed for these specific defects only. **Do not infer entire technical specifications are complete** from these commits. Outstanding camera categories: exact lens identity/recording metadata, all per-mode video/photo and stabilization contracts, recording/decoder/export end-to-end, feature interactions and remote capture. Outstanding fold categories: keyboard insets, multi-window resize of editor and QR camera, large accessibility fonts, dual/tri-fold region selection for all surfaces, touch maps and Activity handoff. Existing previous section ledger remains primary.
- Next exact task: verify #1038. Audit the QR scanner video surface under runtime fold geometry and device owner state, the first-run permissions matrix for empty tracks, and editor/export UI under short keyboard windows. Write behavior tests, not solely source string assertions. Update a counted requirement-to-code/test matrix for both TЗ before assigning numerical completion. No scheduled background automation.

## Focused code audit & implementation — 2026-11-01 QR/native ownership and camera identity

**Scope of this actual interactive batch:** both original source TЗ files were located and opened; latest base at start `5f5d0e3f`, successful GitHub Actions #1036. This section is an implementation checkpoint, NOT a declaration that all ~79 listed end-to-end acceptance scenarios are programmatically closed.

**Implemented and committed to the isolated branch:**
- `aa10c3ae`: QR scanner uses non-preemptive `cameraController.acquire(owner,...,{preempt:false})`, with owner-specific release after decode/failure/unmount, plus test ensuring a recording camera is not evicted. Corrected invalid nested `min(...)` CSS for short fold pairing dialog. CI #1037 successfully produced APK/AAB.
- `317c63e6`: verify actual `MediaStreamTrack.getSettings().facingMode` before attributing a WebView stream to front or rear passport. Tested; CI #1038 successful.
- `84f5b45c`, `b30f7148`, `ba143f74`: a resolved getUserMedia now counts permission as granted only for real live audio/video tracks. Preserve false/unknown rather than claiming a successful microphone or camera. Runtime mock regression added; CI #1042 successful.
- `34b99356`, `1fdd7402`: QR scanner checks native `NativeCapture.status()` and rejects a new WebView acquisition while Android Camera2 service is starting/previewing/recording/paused/stopping; unit/source contract.
- `189c638c`, `fb4d966d`: a generic `video:true` fallback without reported facingMode is no longer automatically labeled as rear camera. Unit test and CI #1046 successful.
- `63e5c344`, `8baea777`: QR scanner native ownership query bounded to 2 seconds, QR image processing cadence to roughly 6 FPS to reduce CPU/battery pressure. The first CI run #1048 failed **only because a source-contract test still expected the earlier unbounded API call**; updated the test in `6e3ae9ff`. CI #1049 run `41317215728` was in progress at checkpoint creation. **Verify its final conclusion.**

**Verified/test limitations:** source-contract tests and mock MediaStream tests are not equivalent to Android lifecycle instrumentation; a native Camera2 session may start between the QR ownership check and WebView acquisition. Do not claim perfect cross-API exclusivity until a shared native owner lease is integrated, with tests. No physical device checks performed at user request. The full TЗ-wide percentage is unknown until each item has source and CI evidence; historical ~99% is not a measured denominator.

**NEXT ACTIONS (in order):**
1. Inspect CI #1049; if failed, read the latest job log and fix without changing main. If successful, record working SHA. 
2. Audit cross-native/WebView camera ownership atomically; consider native session interlock for QR/auxiliary cameras so a Camera2 start racing with QR cannot preempt live capture. Preserve user recording.
3. Inspect startup capability test status after the partial-audio stream change: missing tracks must stay unavailable, no false `granted`, no resource leak, and lens identity must not be invented.
4. Continue camera mode-level recorder/photo/front/stabilization tests and fold-wide editor/gallery/export/keyboard/large-font constraints. Map each to original 43-camera and 36-fold acceptance cases with code-only status separately from deferred hardware acceptance.
5. Update this checkpoint after meaningful changes. Keep all changes in `chatgpt/independent-preview-20261023` and do not enable scheduled runs.

## Interactive implementation checkpoint — 2026-11-01, release #1051

- Base `d3de62a4fd6543e5d878ee8825252f0cc5b1066d`: GitHub Actions #1050 was successful (APK/AAB).
- New code `541b0e98e56a1a353d8ae2748f7a214b7d1c5180` modifies 8 files in isolated branch. Camera controller now rejects empty or all-ended video streams and releases the lease; QR camera processing is bounded to 640px longest side rather than decoding full 4K frames, with tests for corrupt dimensions; QR suspends decoding while hidden; WindowManager observer registration/start failure now invalidates stale fold layout instead of retaining old pane positions; tests added for these conditions.
- CI #1051 `41326541918`: Vitest, TypeScript, WebView SPA build, Capacitor sync and asset verification succeeded at this checkpoint; **Gradle release APK/AAB still in progress**. Check final result before calling this release validated. If failed, read job logs and fix.
- Still open (not proven 100% code-complete): camera first-run passport, per-lens full video/photo modes, Camera2 vs WebView atomic ownership, EIS/OIS/software stabilization verified selection, MP4/editor/export/remote session end-to-end; foldable keyboard/insets, quad/tri-fold UI across every tab, orientation/touch mapping and Activity recreation lifecycle.
- No physical device acceptance completed or required for the user's current code-only stage. Historical 99.x readiness percentages have no requirements-derived denominator: **do not increment them with invented decimals**. Create a counted requirement-to-code-and-test evidence ledger before claiming progress percentage by each original TЗ.
- Next: check #1051; audit Android native lease interlock for Camera2/WebView QR race, and full keyboard/viewport accessibility across camera, editor, pairing and export; add behavior tests and re-run CI. `main` remains unchanged. No scheduled automation.

## Interactive programming continuation — 2026-11-02 (camera ownership + vertical fold panes)

- Verified original working branch HEAD `f40f9b33`; CI #1052 was successful. Do not edit main, merge, or schedule automatic work.
- `f9665da9bc83dca3eb6aeb67ad57948cb51f0dc3`: new `acquireWebViewPreviewWithNativeGuard` unifies CameraTab start and post-RAW restoration. Native Camera2 status checked before and after getUserMedia and again before permitted microphone fallback. Fail closed on bridge outage/timeout, busy native capture, unmounted screen, empty stream; releasing only the current WebView lease. Six behavior tests in `camera-preview-acquisition.test.ts`. CI #1053 first found exactOptionalPropertyTypes error.
- `dec84690`: fixes optional preempt options; **CI #1054 successful** (Vitest, TS, web, Android APK/AAB).
- `3402ac1a`: `--fold-work-top` introduced from actual Android pane's CSS-space top, and reset on invalid/teardown. QR/pairing, editor export and privacy dialogs are bounded on BOTH axes by measured pane, including horizontal tabletop folds; CSS/source tests updated. **CI #1055 successful**.
- `d4fb1724`: native Camera2 states are conservatively deemed free only if `idle` or `saved`; errors, interrupted or unknown states cannot falsely trigger QR/main camera starts. **CI #1056 successful**.
- `d454de44`: QR uses same double-checked guard, with native Camera2 check again AFTER WebView getUserMedia acquisition. Limits a permission-prompt race; **not an atomic cross-API lease**. CI #1057 (run `41345362029`) was in progress at this checkpoint; verify full result before claiming success.
- Open software items: native/WebView atomic owner synchronization; camera lens/mode photo/video capability proof and stabilization audits; Camera2 encoder finalization/export/editor multicamera compositing; fold keyboard/inset/accessibility behavior and per-screen dual/tri/quad live screenshots/instrumentation; all 43 camera and 36 fold acceptance scenarios need mapped source/CI evidence. Do not call either entire TЗ complete just because CI passes.
- Next concrete action: check CI #1057. If red inspect job log and fix. Then audit `CameraTab` RAW/rebind and native foreground capture owner state machine for concurrent native/web acquisition (no mock assumptions); fold modal keyboard on horizontal hinge; increment source-to-requirement ledger based on verified cases, not ungrounded 99.x percentages. No physical device tests required in code-only phase.

## CI closure and exact next action — 2026-11-02

- `d4fb1724` CI #1056 succeeded. `d454de44` CI #1057 initially failed one obsolete QR source-contract assertion after migrating to shared guarded acquisition. `64f56130` updated it; **CI #1059** (`41345487001`) passed all tests, TypeScript, Capacitor/web, release Android APK/AAB upload and release publication.
- `1076dae0` saved the previous checkpoint; the fully tested code including the QR guard is `64f56130d3e0f7c9a82feb125d21e862f1476706`. This checkpoint is a subsequent documentation-only commit.
- Camera change is a **pre/post native status guard**, not an atomic Camera2/WebView hardware owner lease. This must not be misrepresented as a complete race-proof implementation. Next meaningful software task: inspect native CaptureService owner state machine, require a shared Camera2/WebView admission lock where supported, verify RAW-preview restore, recording interruptions and all 43 camera acceptance cases.
- Fold change confines fixed QR, export and privacy overlays to both coordinates of measured pane and invalidates CSS offset upon WindowManager errors. Needs runtime Android/window resizing instrumentation, support for large fonts, keyboard and all 36 fold acceptance cases.
- Prior displayed 99.450% camera / 99.9985% fold are *unmeasured estimates*. **Measured percentage delta across all TЗ requirements remains unavailable** until individual scenario-to-code-to-test coverage is audited. Do not inflate it. No hardware-device acceptance counted. No hourly automation.
