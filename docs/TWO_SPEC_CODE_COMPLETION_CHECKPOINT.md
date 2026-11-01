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
