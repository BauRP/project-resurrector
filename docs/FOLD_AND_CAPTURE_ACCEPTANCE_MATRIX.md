# Foldable and recording acceptance matrix (28 October 2026)

Evidence rule: **NOT VERIFIED** means this full scenario has not been proven on a physical device.
"CODE ...; APK CI PASSED" records only that an implementation exists and the main Android CI pipeline passed (run #521, 28 October); it is NOT a claim that the complete physical scenario passed.
This matrix deliberately separates code/CI progress from device acceptance.
At this checkpoint: 36 scenarios; 7 with code/CI evidence; 0 fully device-verified.
Code/CI evidence coverage = 7/36 = 19.4%; physical acceptance = 0/36 = 0%.
Scenario 26 now has PARTIAL code/CI evidence: bounded MP4 video-frame PTS checkpoint audit, duration metadata, and persisted per-recording fold evidence history (CI #617). Hardware continuity is NOT VERIFIED.
Scenario 05 has PARTIAL source/CI evidence: WindowManager fold observations and Camera2 callback-gap telemetry during a real native recorder session (CI #580); this cannot prove preserved MP4 frames.
Scenario 04 has a Camera2 TextureView output rebind implementation that passed Android CI (#546); the scenario's actual fold behavior and preview FPS remain NOT VERIFIED on physical hardware.
These are auditable per-scenario counts, NOT overall application completeness.

| ID | Device / condition | Expected camera/editor behavior | Status |
|---|---|---|---|
| 01 | Book fold closed / cover | Compact window, no inaccessible controls | NOT VERIFIED |
| 02 | Book fold fully open | Expand workspace from real app-window width | NOT VERIFIED |
| 03 | Repeated open-close | No leaked observers or mistaken hinge count | NOT VERIFIED |
| 04 | Live preview while folding | Correct aspect and no camera re-acquisition on resize alone | CODE PRESENT; APK CI PASSED (#546); PHYSICAL NOT VERIFIED |
| 05 | Recording while folding | Preserve frames when possible; disclose interruptions | PARTIAL CODE; APK CI PASSED (#580); PHYSICAL NOT VERIFIED |
| 06 | Folding with camera settings open | Reachable controls; no full-page jump | NOT VERIFIED |
| 07 | Folding while editing | Playhead and selected workspace retained | NOT VERIFIED |
| 08 | Supported tabletop posture | Preview/control regions outside hinge | NOT VERIFIED |
| 09 | Tri-fold one exposed section | Compact layout, no invented second pane | NOT VERIFIED |
| 10 | Tri-fold two exposed sections | Use only actual supported intermediate app window | NOT VERIFIED |
| 11 | Tri-fold fully open | Up to three functional panes if measured and useful | NOT VERIFIED |
| 12 | Samsung Galaxy Z TriFold | Do not fabricate an intermediate runnable app screen | NOT VERIFIED |
| 13 | Huawei Mate XT/XTs | 1/2/3 sections as geometry references; platform support unknown | NOT VERIFIED |
| 14 | Flip fully open | Full-length main screen UI | NOT VERIFIED |
| 15 | Flip half open | Stable tabletop only when actual hinge data permits | NOT VERIFIED |
| 16 | Flip cover screen | Compact UI only if third-party app access permitted | NOT VERIFIED |
| 17 | Tiny circular external screen | Respect safe bounds; disclose unsupported app windows | NOT VERIFIED |
| 18 | Outward single-panel fold | No imaginary hinge gap | NOT VERIFIED |
| 19 | Dual physical screens | No controls across physical gap | NOT VERIFIED |
| 20 | Portrait/landscape rotation | Real video orientation, touch mapping, and layout | NOT VERIFIED |
| 21 | Split-screen/resizable window | Track CSS viewport separately from physical pixels | NOT VERIFIED |
| 22 | Virtual keyboard | Controls remain visible; no forced restart | NOT VERIFIED |
| 23 | Large system font | No unreachable recording or navigation controls | NOT VERIFIED |
| 24 | TalkBack/large accessibility settings | Navigable controls with meaningful labels | NOT VERIFIED |
| 25 | Touch-to-focus after resize | Correct crop, mirror and coordinate transform | NOT VERIFIED |
| 26 | Capture duration through fold | No false continuation; check saved segments | PARTIAL CODE; APK CI PASSED (#617); PHYSICAL NOT VERIFIED |
| 27 | Narrow windows | No horizontal overflow | NOT VERIFIED |
| 28 | Hinge / system insets | No unreachable or occluded primary controls | NOT VERIFIED |
| 29 | Editor/control tapping | No unexpected scroll-to-top | NOT VERIFIED |
| 30 | Capability and viewfinder states | No fake/placeholder support claims | NOT VERIFIED |
| 31 | Single recorder microphone unplug | Show incomplete recording; salvage original bytes | NOT VERIFIED |
| 32 | Two recorders and mic unplug | Both streams finalize; no fake clean pair | NOT VERIFIED |
| 33 | High-speed 4K/FPS encoder | Bitrate has no 32-bit arithmetic overflow | CODE PRESENT; APK CI PASSED; PHYSICAL NOT VERIFIED |
| 34 | Encoded MP4 sample timestamps rollback | Do not certify FPS | CODE PRESENT; APK CI PASSED; PHYSICAL NOT VERIFIED |
| 35 | Slow editor playhead updates | Debounced persistence, flush on pagehide | CODE PRESENT; APK CI PASSED; PHYSICAL NOT VERIFIED |
| 36 | Android Activity recreation | Restore UI-only state, never fake recorder continuation | CODE UNIT-TESTED; APK CI PASSED; PHYSICAL NOT VERIFIED |

Tracking rule: a scenario becomes PHYSICAL VERIFIED only with a device, APK version, observed result, and saved evidence. Adding source code or passing the CI pipeline must never upgrade it to PHYSICAL VERIFIED.

See source requirements: `СДелать Раскладушки(2).txt`, scenarios 1–30, and `MULTI-CAM-POV_Обнаружение камер и проверка(3).txt`, camera/video acceptance. A passing unit test cannot replace a physical-device observation.

## Source-level audit improvement — 29 October 2026 (pending CI and device acceptance)
- Scenario 26: Native Camera2 MP4 passport now retains **unknown** when a fold checkpoint was decoded but the corresponding before/after encoded PTS span was not measurable. Missing span evidence must not be mistaken for continuous frames. A measured gap above 250 ms remains suspicious, not a conclusive lost-frame count.
- Scenarios 03/05/26: When more than 120 fold/window events arrive, baseline-preserving journal truncation now accounts for the exact lost posture/geometry edges, including an open-close cycle that returns to its starting posture. It also refuses delayed snapshots from an older Activity when a newer Activity owns current topology.
- Added regression tests for alternating postures, old-Activity callbacks and missing MP4 PTS measurements.
- **Validation status for this new change:** source changes committed; CI outcome not yet independently confirmed. No physical folding, EIS/OIS effectiveness or hardware recording continuity tested here. Do not increase the 0/36 physical acceptance count or claim full scenario completion.

## Native recording / fold-checkpoint completeness — 29 October 2026
- Camera document: Native Camera2 MP4 checkpoint inspection now has an explicit `mp4CheckpointAuditCompleted` flag. The native service resets the flag at the start of each new recording and checkpoint inspection. A parser exception, unreadable file, or missing video track no longer defaults to a silently successful scan. The final file receives an incomplete/interrupted verdict when the scan did not complete, while preserving salvageable bytes.
- Foldable document, scenarios 05 and 26: the status is exported to the Camera2 mode passport and a bounded anonymized technical report. A decoder result near one fold is not treated as proof of continuous recording; unresolved before/after encoded timestamps stay unverified.
- Regression test: a saved MP4 with a failed checkpoint scan must remain `unknown` in the passport even if basic track metadata decodes. A completed scan may still only qualify as `recorded`, **never** as fully device-verified.
- Validation: these source changes are committed to the isolated branch. Full CI / release APK and physical-device results were **not yet independently confirmed for this batch**. Leave the 0/36 physically verified figure unchanged.

## Native fold posture versus geometry classification — 29 October 2026
- Android WindowManager features are now sorted into canonical signatures so callback ordering alone cannot generate false fold events.
- Device hinge posture (state/orientation/occlusion/separation) is counted separately from mere updates to hinge bounds. The very first observation, even one with zero reported hinges, is treated as a baseline rather than as a fold transition.
- Approximate MP4 checkpoints are created for posture transitions only; geometry-only window updates no longer fabricate a physical folding checkpoint. Existing Camera2 recording remains owned by its foreground service; this observer change does not restart the recorder.
- Native bridge, screen diagnostics and anonymized audit output now expose separate posture/geometry counts. A regression test checks this separation in the exported audit.
- Validation: changes committed to isolated branch; these code changes do **not** establish physical device continuity, actual fold acceptance, new APK success or visual EIS/OIS performance. Hardware acceptance remains unverified.

## Fold checkpoint audit completeness — 29 October 2026
- Previously, a fold position outside the 500 ms middle window could be silently skipped while the MP4 audit still returned `saved`. Such near-start/end observations are now counted in `mp4FoldPointsSkipped` and downgrade the finalized result to `saved_interrupted` (video bytes may still be present).
- Native Android now separately requires a before-and-after encoded PTS measurement for every attempted fold checkpoint. Decoding a nearby frame alone is insufficient; missing PTS spans are an incomplete audit.
- The Camera2 bridge, mode passport, on-screen diagnostics and anonymized report expose the skipped count; regression tests cover invalid/skipped values and privacy-safe export.
- This is bounded checkpoint evidence, not frame-by-frame validation. Android hardware and GitHub Actions acceptance have not been verified for this batch; physical acceptance figures must not be increased.

## Durable Camera2 / fold evidence after process death — 29 October 2026
- Found a cross-layer persistence gap: the Android history store did not copy `mp4CheckpointAuditCompleted`, `mp4FoldPointsSkipped` or `foldGeometryOnlyChanges` despite their presence in live Camera2 capture status, on-screen diagnostics and the anonymized export. These fields are now retained in the bounded 24-entry durable history.
- Abandoned recordings now explicitly carry `mp4CheckpointAuditCompleted=false` and `savedBytes=0` with `state=interrupted`; historical posture/geometry counters are retained, but stale or orphaned media are not certified.
- Added a source-level regression contract test to check Android native service/history fields against the anonymized TypeScript reporting layer. This guards against accidental future omission; it does NOT replace an Android instrumented test.
- **Acceptance state remains open:** GitHub source changes committed, but current CI results and a successful APK/AAB build were not independently confirmed, and no real foldable device was tested. Do not equate 98%/99% indicative software-readiness estimates with hardware certification.

## Bounded eight-point fold audit and recorder pause — 29 October 2026
- A native recording may encounter more than eight true observed hinge-posture changes. Extra **active recording** changes now increment `foldCheckpointsOmitted` instead of vanishing. These unexamined transitions force `saved_interrupted` at native finalization and `unknown` in the Camera2 per-mode passport; video bytes are preserved.
- Hinge-posture changes during `MediaRecorder.pause()` increment a **separate** `foldChangesWhilePaused` counter rather than creating fictitious PTS samples or consuming one of eight MP4 checkpoints. Resume clears fold-adjacent callback timing reference.
- Both counters flow through persisted Android history, Capacitor bridge, on-screen diagnostics and privacy-safe exported audit. Regression tests cover exceeded checkpoint counts and paused changes in the report.
- A status downgrade is a limitation of **the bounded verification**, not proof of damaged video or dropped encoded frames. Current hardware acceptance and new build/test outcomes remain unverified.

## Finalized MP4 track fidelity — 29 October 2026
- Native Camera2 finalization now treats a long MP4 with no readable video samples near its end as incomplete even when a nearest-sync-frame decoder returns an earlier frame. This distinguishes tail-keyframe decoding from actual tail sample evidence.
- The per-camera mode passport requires encoded MP4 track width and height to match the requested dimensions **in order**. A transposed track is not reinterpreted as the original mode merely because portrait/landscape rotation metadata may differ.
- Added TypeScript regressions for missing tail samples and transposed track dimensions. This is bounded file validation, not full-frame decode, optical/EIS effectiveness certification, or real hardware fold acceptance.
- Commits alone do not verify Android APK/AAB compilation; hardware and CI outcomes remain unconfirmed until actually observed.

## Android crash recovery / recorded FPS consistency — 29 October 2026
- Recovery from an abandoned Camera2 service now clears persistent file path, gallery URI, MP4 track/decoder claims, sample counts and prior checkpoint-completion state. The interrupted attempt remains retained in the bounded audit log, with no claim that an orphaned MP4 was validated.
- Native MP4 finalization now checks measured bounded start/end FPS against the requested recording FPS using the same 10% / minimum 2-fps tolerance as the Camera2 passport. It also refuses missing or mismatched video track dimensions. These checks flag incomplete evidence without deleting the finalized recording.
- Added regression contract assertions for the cleared persisted state; this is **source-level** evidence only. The changes require successful Android CI and on-device lifecycle, audio/video and fold testing before acceptance.

## WindowManager listener leases and incomplete fold observation — 29 October 2026
- Android observer registration now creates a per-listener lease; native fold callbacks are accepted only if the lease belongs to the current WindowManager observer. An old Activity may not inject a late fold event into the current Camera2 capture.
- When an active recording loses its fold observer, `foldObserverGap=true` is persisted and carried through the native recording status, 24-entry audit history, Capacitor bridge, diagnostic UI and Camera2 per-mode passport. This prevents inferring uninterrupted fold observation from a silent observer disconnect.
- Attaching a new observer resets its posture baseline instead of counting the first geometry as a physical fold; no Camera2 encoder restart is requested. Native MP4 files are preserved while the unverified fold period is labeled incomplete.
- Added TypeScript regression checks for unknown fold observer continuity and anonymized export. No hardware-driven lifecycle acceptance or Android CI success has yet been demonstrated for these changes.

## Fold journal callback chronology and unknown initial posture — 29 October 2026
- A duplicate native callback now advances both the revision and most-recent observation-time watermarks without rewriting the original pre-recording baseline timestamp. This blocks queued older geometry observations with the same native revision from entering the capture log.
- A journal lacking a verified pre-capture baseline counts only actual consecutive transitions, not its first observed screen as a fold. Status remains explicitly uncertain where baseline evidence was unavailable.
- Added regression coverage for delayed same-revision callback, baseline timestamp preservation and the actual observed transition count. These are unit/source-level checks; they do not establish hardware acceptance.

## Native observer first-callback race and long MP4 passport — 29 October 2026
- Camera document: For MP4 tracks longer than two seconds the per-mode passport now requires an explicitly measured, positive number of tail samples **and** an affirmative near-end timestamp result. Missing fields no longer silently qualify as recording proof. Historical incomplete evidence remains unknown.
- Foldable document: A new WindowManager listener lease is activated before connecting its callback so synchronous initial topology notifications cannot be discarded as stale. This is a native observer lifecycle correction, not a simulated hinge or a camera restart.
- Added unit/source-contract tests for missing tail values and the lease-registration order. Android instrumentation, actual MP4 recording, and hardware fold/unfold acceptance are still outstanding; no percentages or device-certification counts should increase solely due to commits.

## Real pre-capture fold baseline and unknown MP4 dimensions — 29 October 2026
- A valid current WindowManager observer now retains its latest real posture and geometry before video recording starts. Both Camera2 recording session paths initialize their recording baseline after MediaRecorder starts, so a first genuine fold need not be misclassified as the initial static state.
- On owner handoff/teardown the cached baseline is invalidated. If no live observer has supplied a real pre-capture state, `foldObserverGap` is set and continuity remains unverified; no simulated hinge is inserted and the video recorder is not restarted.
- The TypeScript MP4 track summary now reports `unknown` when an otherwise inspected track has no measured encoded width/height for a requested video mode; actual dimensions must not be fabricated from the request.
- Added source-contract and TypeScript regression checks. Device-tested fold continuity, complete MP4 decoding, stabilization effectiveness, and a successful new APK/AAB are **not** established by these commits.

## Audio/video tail integrity during native Camera2 and fold capture — 29 October 2026
- Before this change, the Android MP4 audit read audio only at the start, so a long recording could be described as saved even when audio ended significantly before its video track. Native MediaExtractor now performs a **bounded final audio sample scan** in addition to the existing video tail audit.
- For requested audio in recordings longer than two seconds, finalization now requires real audio samples near the MP4 end and a measured last-audio/last-video PTS offset within one second. Failure downgrades the saved capture to `saved_interrupted`, preserving the actual media file. These are conservative diagnostic thresholds, not proof of audible quality or sample-accurate A/V sync.
- Tail audio sample count, proximity and A/V offset are carried through the Capacitor bridge, per-mode passport, 24-entry native audit history and anonymized report. The passport also remains `unknown` if the required tail observations are missing.
- Added unit regression tests for absent audio tail, wrong PTS offset, unknown measurements and video-only capture. Source-level persistence guard expanded.
- Actual Android CI/test results and physical foldable recording acceptance are not confirmed for this batch. Do not raise either readiness percentage from code changes alone.

## Correct track isolation in Camera2 MP4 diagnostics — 29 October 2026
- Camera/recording requirement: each bounded MediaExtractor prefix scan now seeks explicitly to the start of its selected track. Otherwise examining the video tail could leave the shared extractor positioned at EOF and falsely classify the audio prefix as missing or unreadable.
- Actual video width/height now come from the **same first video track** chosen for sample inspection; metadata from additional video tracks cannot overwrite the selected track dimensions.
- Requested audio is checked for duplicate/rollback presentation timestamps in the prefix and tail. A detected anomaly downgrades the native finalization/Camera2 passport instead of claiming a clean MP4. The bounded anomaly count is persisted and exported without media IDs or paths.
- Regression tests cover the source-level seek and track-selection contract, audio timing anomalies, and privacy-safe reporting. The code audit does not certify uninterrupted fold capture, real-world sound quality, actual video stabilization, or the Android build.

## Fold-adjacent audio timestamps — 29 October 2026
- Both requirements now share a bounded MP4 check for audio samples on both sides of actual recorded fold checkpoints (at most eight). Video and audio use independent extractor track selections; a missing audio PTS bracket cannot count as a verified fold-capture with sound.
- Requested audio plus absent audio PTS measurement or a sampled span over 500 ms marks recording evidence incomplete (`saved_interrupted` native, `unknown` in Camera2 mode passport). Video-only capture is not required to contain an audio track.
- Audio fold-check counts, suspected gaps and maximum measured gap are exported to Capacitor status, the 24-entry persistent native journal, anonymized technical report and on-screen diagnostics; regression tests cover positive/negative cases.
- These findings are **bounded timing indicators**, not proof of decoded audible samples, perfect synchronization, zero dropped frames, working stabilization or physical fold-device acceptance. CI and a new APK have not been confirmed by these source changes.

## Strict persisted MP4 evidence validation — 29 October 2026
- Camera specification: impossible negative, fractional or otherwise invalid decoded-video timestamp counters are no longer treated as clean MP4 evidence in the Camera2 passport.
- Foldable specification: recorded fold audio and video PTS span counts must exactly match their sampled fold checkpoints, and invalid maximum audio gap metrics cause an `unknown` rather than `recorded` verdict.
- Invalid or fractional long-MP4 audio tail sample counts or tail A/V offset values are also not considered verified evidence. Regression tests cover all of these contradictions.
- These validations operate on reported MP4 metadata. They do not establish whole-video integrity, visual stabilization effectiveness or physical-device fold acceptance.

## Functional gap audit: WebView origin and permanent Gallery publication — 29 October 2026
- Against foldable sections 4–9, the Android bridge now reports **measured WebView bounds in DecorView-relative window pixels**. Frontend pane mapping clips real WindowManager folding features to the embedded WebView and then converts to CSS coordinates; shifted/letterboxed WebViews, book folds, tri-folds and corrupt bounds have dedicated tests. Do not assume native window (0,0) equals browser (0,0); system insets must not be applied twice.
- Against camera spec sections 10.1–10.3, copying bytes to MediaStore and clearing IS_PENDING is no longer enough to report a successful Gallery publication. The service explicitly reopens the finalized content URI; if this fails, the incomplete provider item is deleted and the original local MP4 remains available. A source-level regression contract guards publication order.
- Scope limit: the read-back proves URI accessibility at that instant, not byte-for-byte verification, external Gallery indexing or physical storage durability. Neither the observer geometry logic nor local Gallery publication should restart Camera2 on a fold.
- **Review correction:** the earlier 98%/99% were estimates of code progress, not justified acceptance scores. Do not promote them to 100% without matrix-based functional evidence and real-device validation. Source changes and CI outcomes must be reported separately.

## Functional four-pane camera workstation — 29 October 2026
- A **real** pair of perpendicular, separating WindowManager hinges can yield four measured usable regions. The adaptive camera now selects a 2×2 workstation only if all four panes satisfy size, row alignment and non-overlap checks. Top-left preview, top-right HUD, bottom-left settings and bottom-right recording controls use measured positions, not model/device assumptions.
- Added dedicated CSS positioning and explicit cleanup of all 16 four-pane variables after the geometry changes or the screen observer unmounts. Unsupported, insufficient or malformed configurations retain ordinary camera UI instead of simulating a four-panel device.
- Added unit regression tests covering perpendicular hinges, reordering, and rejection of decorative/undersized panes. This is functional UI code and CI-testable geometry, but must still be validated with actual Android WindowManager reports and touch targets on hardware.

## Failure-preserving native MP4 finalization — 29 October 2026
- Camera/recording requirement: if Camera2 or MediaRecorder reports an error but a finalized, locally readable MP4 remains salvageable, the Android service must keep the original failure evidence. Final state is `saved_interrupted`, never `saved` merely because the final MP4 parses.
- Failures before encoder start that leave no recoverable file now persist an `error` attempt in the bounded native audit history instead of disappearing.
- Foldable/recording continuity: a fold-related camera disconnect can no longer be overwritten with an apparently successful saved capture. This does not interrupt the recorder merely for a fold layout event.
- Added a source-level regression guard. Passing CI verifies source/tests/build, not Android hardware fault-injection or real-device session continuity. Physical acceptance remains open.

## Native Android direct preview respects measured physical hinges — 29 October 2026
- Previously the direct Camera2 TextureView overlay only checked whole-WebView bounds. After a physical fold, the Android overlay could cross a real separating hinge even though the HTML camera UI was pane-aware.
- Direct preview placement now also checks that its entire measured CSS rectangle fits within one actually reported usable fold region. If not, the overlay is hidden without stopping the Camera2 recorder; after the layout becomes safe the preview may reposition. Fold topology updates trigger a fresh placement check.
- Added regression tests for a valid left/right pane, a rectangle crossing an actual hinge, and malformed multi-pane metadata. This is functional safety gating, not a hardware claim; live testing of Android TextureView occlusion and physical folding remains outstanding.

## Native preview after fold: real geometry, stale show requests and axis scaling — 29 October 2026
- Camera and foldable requirements: UI now passes the active WindowManager-derived usable region geometry into direct Camera2 preview placement. A native TextureView that crosses a physical hinge is not shown; folding events recheck visibility without restarting the recorder.
- The queued Android 'show preview' command revalidates the current target rectangle and pane before execution, to avoid displaying an obsolete overlay after a layout change.
- Android now converts CSS X/width using measured WebView X scaling and Y/height using its independent Y scaling; it requires both reported viewport dimensions. A source-contract test checks that Y uses Y scaling.
- CI and hardware verification are separate gates. Real fold, on-screen focus touch targets and uninterrupted recordings on device remain to be tested.

## Native physical-hinge safety at overlay submission — 29 October 2026
- The native WindowManager observer retains only actual separating hinge rectangles under its active lease. Before adding or moving the Android TextureView, the plugin checks the overlay window rectangle against the latest real hinge geometry **on the UI thread**. A crossing show request is rejected, and the same owner's old overlay is detached. This closes a safety gap when a JavaScript measurement becomes stale before native placement.
- A real but still-unreported initial topology is treated as pending, not as a flat device. Zero-width and zero-height separating seams receive a small 2px safety margin. The guard does not create synthetic hinges or interrupt the MediaRecorder.
- Source-contract regression coverage asserts lease reset, reported separating features and native crossing rejection. This is not real hardware validation; on-device rotated, tabletop and multi-window tests remain necessary.

## Native overlay safety after an already-visible physical fold — 30 October 2026
- The Android WindowManager callback now triggers a same-UI-thread recheck of an **existing** Camera2 TextureView. A surface that was safe before the hinge moved is detached when its actual window rectangle now crosses a reported separating hinge, without stopping the MediaRecorder.
- This complements the prior gate at initial show-command submission; the observer tracks its current real lease and the overlay uses a weak Activity reference to avoid retaining a destroyed screen. Regression contract tests check this notification path.
- No claim is made that every OEM callback is delivered before any visual overlap, that a real tri-fold passed hardware acceptance, or that device testing has occurred. CI result for this change is tracked separately.

## Durable Gallery recovery without reopening Camera2 — 30 October 2026
- Camera requirement §10.2: when MediaStore publication fails but a finalized verified private MP4 remains, the user can explicitly retry publication without creating a new camera session. Android reopens the existing MP4 with MediaExtractor, verifies a real video sample, confines selection to the canonical app-owned native-video directory, and uses the same copy / URI-readback path as the original publication.
- The retry is performed away from the UI thread; parallel attempts and active recording are disallowed. Before publishing its result the service checks the saved capture ID and path again, avoiding a late retry from overwriting a newer camera session. A new audit entry records a successful retry. A failed attempt retains the original local MP4.
- This is functional local-file recovery, not recovery of an unfinalized recording after process death. No hardware tests or storage-failure injection have been completed.

## Fold editor and settings content safe pane — 30 October 2026
- In the actual WindowManager split regions, editor/settings now select a usable pane intersected with the **content area below the fixed header**, not merely the widest pane across the whole window.
- A measured vertical offset and maximum safe height keep independently scrollable editor/settings content inside a horizontal tabletop region. Book and tri-fold layouts continue selecting the largest viable measured pane; invalid/undersized regions gracefully fall back without inventing a hinge.
- Pure calculation tests cover horizontal two-pane and unsupported small-pane geometries. Native MP4 and Camera2 ownership are unchanged by this layout-only update. Real device UI touch and keyboard acceptance is still pending.
