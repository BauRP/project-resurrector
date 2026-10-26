# MULTI-CAM POV — independent backup branch implementation status

Branch: `chatgpt/independent-preview-20261023`. Main must remain unchanged.

## Implemented in source (build-checked, **not device-verified**)
- Android Jetpack WindowManager observes reported window hinge geometry, posture and occlusion. CSS viewport regions are computed from reported bounds; conventional narrow screens get normal camera UI.
- One actual separating hinge can split preview and controls. Two reported separating hinges can divide viewfinder, camera controls and shutter into **three zones** when each zone is large enough. Short hinge segments are ignored; no synthetic third hinge is invented.
- WebView video acquisition controls track ownership, timeouts and late media streams; video-only permission fallback exists.
- Camera2 enumerates cameras/physical IDs, theoretical sensor modes, OIS/EIS modes, dynamic range, codec candidates, RAW, and high-speed declarations.
- Camera diagnostics run short sample recordings per WebView device and requested resolution/FPS. Per-device/mode queue survives interruption and keeps separate waiting, running, verified, retry, deferred and error statuses.
- Camera2 test sessions expose stabilization CaptureResult; DNG RAW is captured through a separate native Camera2 pipeline; high-speed Camera2 capture has bounded state reporting.
- Dual WebView camera preview and short simultaneous two-encoder diagnostic are available where independent streams work; paired clips use one IndexedDB transaction.
- The main video shutter now connects to two independent real WebView MediaRecorders when Dual Camera is enabled and two distinct live camera streams are confirmed. Clips carry a paired capture-group ID, individual device IDs, monotonic start evidence and an explicit non-synchronization flag. Failure attempts to salvage readable clips. This is a functional implementation path, not physical-device-certified professional synchronization.
- Ordinary camera recording saves encoded blobs to IndexedDB and reads persisted copies back before confirming storage success; separate WebView playback verifies that the **first frame decodes**. A bounded requestVideoFrameCallback sample can report **approximate displayed FPS**, never encoded FPS.
- Clip loss/error statuses do not claim recording succeeded; leaving camera while saving is postponed; fold resize alone does not restart recording.
- GitHub Actions runs unit tests and builds APK/AAB for the backup branch.


## Safety and compatibility hardening — 25 October 2026
- Optional WebView mode diagnostics use a non-preemptive camera lease: they defer rather than stopping the active user preview.
- Failed or denied `getUserMedia` attempts relinquish their lease so later capture retries are possible; superseded attempts cannot clear a newer owner. Added regression tests for denied and synchronous failures.
- Camera settings calls are serialized/coalesced with settled waiters on release; independently held video streams can still receive their own commands.
- Transient diagnostic contention and timeouts are reported as unknown/deferred rather than permanently unsupported. Expanded diagnostics can retry failed tasks.
- Invalid/non-finite and out-of-window Android folding bounds are rejected; regression tests cover false hinge splits.
- In dual WebView capture, salvageable encoded clips are committed to IndexedDB before any playback analysis. The first frame is then checked using the reloaded persisted clip, rather than just an in-memory encoder Blob.
- Dual recording now removes ended-track event listeners from long-lived live-preview tracks when the recording finishes, preventing callbacks from accumulating over repeated sessions.

**Remaining limitations:** These are code and CI-level improvements, not measured physical-device compatibility. Persisted video first-frame decoding does not establish complete file integrity or synchronized camera timestamps. Folding and camera behavior during device/Activity transitions must still be tested on actual foldables. Neither specification is at 100%.


## Safety hardening — 25 October 2026, additional batch
- Adaptation now tracks actually measured usable pane regions when the WebView viewport resizes even without a new Android WindowManager revision. The emitted fold event reports validated separating hinges and is deduplicated; it does not restart the encoder or prove uninterrupted capture.
- Dual camera capture does not label interrupted, early-stopped, or failed sessions as successfully paired even when some saved clips decode. A paired success is a recording-availability statement, **not** an exact hardware synchronization guarantee.
- Added tests for dual recording result semantics, real two-hinge geometry reporting, and standard one-pane geometry.
- Physical fold/unfold while recording, Activity recreation, exact camera clock alignment and complete frame integrity remain unverified and require on-device checks.


## Camera and folding reliability — 25 October 2026 (next batch)
- Real single-camera MediaRecorder error handling now attempts to salvage nontrivial encoded chunks into IndexedDB instead of dropping the file on any encoder error. An interrupted/error session retains an error state and explanatory message even if its clip is saved; empty and tiny files are rejected.
- Camera passport writes ignore older asynchronous observations for the exact same camera/API/resolution/FPS; this prevents delayed tests overriding newer results. Regression tests cover this.
- Fold layouts with mixed vertical/horizontal dividing features avoid selecting unsupported side-by-side camera pane layouts. Geometry tests cover a four-region case with two genuine perpendicular hinges.
- Fold resize tracking and dual-camera result truthfulness remain as documented previously. The new code is CI-validated, **not physically verified** for camera/folding transitions.

## Verification and folding telemetry hardening — 25 October 2026
- WebView mode diagnostics compare the **decoded recorded file dimensions** with the requested camera mode separately from MediaStreamTrack.getSettings(). A 4K stream which yields a 1080p decoded video is recorded as an incomplete mode proof, not verified 4K. The first decoded frame and encoded byte length are stored in per-camera evidence; this does not prove codec frame rate.
- Diagnostic MIME selection does not require an audio codec on video-only test streams.
- Disconnected WebView camera queue entries no longer displace active cameras when the bounded persistent queue is rebuilt.
- Fold event capture rejects malformed timestamps and excessively long posture strings; this is metadata validation, not a claim of guaranteed continuity during physical folds.
- Regression tests cover requested-versus-file dimensions, corrupt fold event telemetry, and disconnected device task eviction.

## Dual-recorder failure-path regression tests — 25 October 2026
- Added simulated WebView MediaRecorder lifecycle tests for both real, distinct device streams: encoder start events, stop/finalization, decoder check after durable write, real fold metadata, stream-ended interruption, media encoder error and storage failure.
- Simulated tests confirm a failure or background-style interruption is not presented as a synchronized, uninterrupted pair. User video bytes remain available for salvage where the encoder emitted them.
- Tests use mock encoders/storage and **do not** establish physical multi-camera compatibility, actual frame synchronization, uninterrupted recording on a foldable, or long-running thermal stability.
- All modifications remain isolated to `chatgpt/independent-preview-20261023`, never merge into `main` without user approval.

## Browser-version passport freshness and fold UI cleanup — 25 October 2026
- Historical per-camera video checks are preserved, but no longer treated as live verified proof after a WebView user-agent or diagnostic-engine revision change. Unversioned legacy records require re-verification too; the original measurements remain visible.
- Added regression tests for legacy passport migration, previously verified records under changed WebView context, and preservation of past camera evidence.
- After moving from tabletop (horizontal hinge) to book/cover orientation, obsolete CSS offsets for upper/lower panes are removed instead of leaking into the new layout.
- No claim of complete codec FPS verification, uninterrupted Activity-recreation video, or physical foldable compatibility is made without physical tests.

## Dual encoder timeout recovery and mixed-hinge layout — 25 October 2026
- When the second MediaRecorder fails to deliver onstop within 12 seconds, previously emitted chunks are no longer discarded automatically. Nontrivial data is saved as a potentially incomplete clip and verified separately from local storage. A timeout is always treated as a failed dual recording, never as a successfully synchronized pair.
- Added an end-to-end mock lifecycle regression covering a stalled second encoder, ordinary paired completion, stream loss, error and failed IndexedDB persistence. This is software-test coverage, not verified device recovery.
- Tabletop camera UI now requires precisely two actual vertically stacked regions of similar width and position. Mixed perpendicular hinge layouts with four regions no longer trigger the inappropriate two-pane tabletop controls.
- Real physical device continuity, 4K high-load thermal behavior and full-file integrity remain unverified.

## Bounded persisted-media inspection and fold region truthfulness — 25 October 2026
- Saved recordings are now checked at three small byte ranges (start/middle/end) after IndexedDB read-back, in addition to checking identifier, blob length and MIME type. Sampling uses no full-file in-memory copy and has a FileReader fallback for older WebViews. **This does not prove full-file integrity** or successfully decoded video; decoding remains a separate check.
- Added tests for equal media and same-size modifications at the start, middle and end, plus MIME mismatches.
- Fold evidence counts only hinges that actually divide a usable WebView window region. A manufacturer-reported short hinge segment that does not split the app window no longer claims an extra active pane. Existing two-hinge and mixed-orientation tests still run.
- Physical phone testing remains outstanding for recording integrity after prolonged capture and folding/unfolding during active recording.

## Single recorder stop timeout, fold-time touch focus, and bounded telemetry — 25 October 2026
- Added a single-recorder finalization guard: when a stop callback does not arrive within 12 seconds, the recording is finalized once with a clear timeout error and an attempt to preserve emitted video chunks. A late callback cannot finalize the same video twice. This is best-effort salvage, not a guarantee that incomplete WebView container bytes decode.
- Stop guard is invoked on user stop, actual video-track loss, WebView background transition and camera screen unmount. Encoder error also activates the guard. The existing persistent storage and decoded-frame verification remain separate stages.
- Touch focus falls back to the centre instead of producing NaN or infinite coordinates when fold transitions temporarily leave a zero-sized or invalid preview viewport.
- Android fold event metadata now rejects impossible high hinge/region counts. Camera settings reject expired stream references for the controller's current primary track.
- Tests cover timeouts, duplicate finalization, invalid preview coordinates and invalid fold event metadata. These are code-level tests, not physical device guarantees.

## Applied zoom/focus confirmation and truthful diagnostic UI — 25 October 2026
- The WebView camera zoom and manual-focus UI now separates a requested slider value from a setting actually reported by MediaStreamTrack.getSettings(). Driver acknowledgments without exposed applied settings are explicitly **unconfirmed**, not shown as hardware verification. Expired rapid-slider callbacks cannot overwrite later commands.
- Camera control read-back supports numeric tolerance and string modes; a changed/ended track returns unknown. The focus control resets its request generation after a stream change, and hook invocation remains stable when a lens cannot focus manually.
- A preview with zero/invalid dimensions still routes touch focus to safe centre coordinates (previous improvement).
- Mode diagnosis distinguishes a saved but mismatched video file from a verified recorded mode. Merely recorded evidence now stays deferred for re-check rather than appearing as an irrecoverable camera failure. The UI shows separately confirmed modes and recorded-only files.
- Code-level tests cover matching/denied/unknown applied settings and the non-verification of recorded-only modes. Physical phone verification remains outstanding.

## Camera controls and resized fold panes — 25 October 2026
- Manual focus and zoom now distinguish requested UI values from **reported applied camera settings**. WebView `applyConstraints()` resolving without a matching `getSettings()` value is not treated as camera-hardware confirmation; unsupported reporting is shown as unknown, not fabricated success. Rapid slider callbacks are versioned and stale replies are ignored.
- The focus rail keeps React hook ordering stable across fixed-focus and manual-focus camera switches. Changing streams invalidates the old pending request and an invalid focus viewport safely uses the centre.
- The diagnostics UI separates truly verified per-camera video modes from files that were recorded but did not prove the mode. Those incomplete results remain eligible for further diagnosis, not a definitive unsupported verdict.
- Folding evidence includes a bounded, rounded signature of **actual usable pane geometry**. A WebView resize that changes pane dimensions but not the Android WindowManager revision can now produce a distinct capture event, while unchanged geometry remains deduplicated.
- Added regression tests for mode classification, camera-setting readback, and same-revision fold geometry changes.
- Limitations: driver-exposed settings are not independent optical verification; video codec FPS, frame-perfect multi-camera sync, physical folding continuity and all-device compatibility still require native/device-level testing.

## Capture-start timeout reliability — 25 October 2026
- Fixed a critical defect in independent two-camera recording: the 8-second *startup* timeout remained armed even after both MediaRecorders confirmed onstart, stopping healthy recordings after eight seconds. It is now cleared when both truly start and never armed if synchronous starts already completed.
- Added simulated >20-second dual recording regression and a missing-second-onstart failure case. The latter stops and reports partial startup instead of claiming synchronized recording.
- Added an independent 8-second single-camera onstart watchdog. If MediaRecorder never confirms startup, it reports an error and safely requests stop/finalization with existing 12-second fallback. Late onstart callbacks after explicit stop, backgrounding, lost camera or unmount cannot revive a stopped recording.
- Regression tests verify no premature timeout, honest failure classification, one-time watchdog timeout and cancellation after a confirmed start. They use simulated WebView encoders; uninterrupted real-device camera capture still requires field validation.
- Folding/resizing tests remain in place and no MediaRecorder is recreated merely because the CSS panes change.

## Camera-disconnect and fold-listener lifecycle hardening — 25 October 2026
- Dual MediaRecorder capture now snapshots verified device IDs while both video tracks are available. If an OEM driver later throws from `getSettings()` after disconnect, clip salvage can still preserve camera identity and save chunks, while honestly marking the session interrupted.
- Concurrent-camera verification handles driver exceptions as unknown/unavailable rather than crashing or inventing support. Added regression tests for unreadable device IDs and ID preservation after track loss.
- Fold-aware ResizeObserver now unobserves the detached camera subtree on tab transitions and observes the replacement only once; the cleanup path also releases its reference.
- Multi-hinge layout evidence is normalized by sorted measured pane positions. Reordering identical native hinge features no longer creates fictitious topology changes. UI fold counts now reflect features actually dividing usable regions, not invalid/out-of-window raw events.
- These are unit/build-verified mechanisms, not physical proof of uninterrupted camera recording during Activity recreation, device folding, thermal load or extended dual-camera sessions.

## Capture integrity, asynchronous UI status and multi-hinge layout — 25 October 2026
- A dual WebView recording captures the two distinct device IDs in one initial validation; an OEM driver that later refuses `getSettings()` cannot interrupt the metadata save path.
- MediaRecorder chunks that were emitted despite a missing `onstart` event are preserved as potentially incomplete video data. They never establish a confirmed paired recording; full decoding of persisted media is still checked separately.
- Single-camera stored-file verification and subsequent approximate displayed-FPS reporting are scoped by a recording-session generation. Results from a previous recording cannot overwrite messages from a newer recording.
- Unsupported four-region crossing-hinge topologies no longer accidentally select the two- or three-pane camera layout. Existing layout keeps a safe fallback instead of inventing a four-zone user interface.
- Mock-driven tests check salvage when `onstart` is missing. Physical long-duration recording, full-file frame integrity and transitions through Android Activity recreation remain unverified.

## Add-only durable recording and fold observer shutdown — 25 October 2026
- IndexedDB clip groups now use atomic add-only writes instead of upsert/put. Duplicate clip IDs must abort the group and must not replace an existing user video. A specific duplicate-ID failure message is returned rather than silently overwriting a clip.
- Added regression tests for collisions within a new group (rejected before opening storage) and collisions with a previously stored clip (verifies add-only writes and abort handling).
- An Android WindowManager fold observer can finish starting after its React owner unmounts. The async bridge now checks disposal after startObserving() resolves and requests stopObserving() again, preventing an orphaned native subscription.
- Limitations: add-only persistence prevents accidental overwrites, but hardware failures or IndexedDB corruption may still lose storage; compatibility during actual fold/unfold Activity recreation remains unverified. Unit tests/CI do not substitute physical-device testing.

## Per-camera passport version isolation — 25 October 2026
- Fixed an important false-verification bug: after a WebView/diagnostic engine change, testing one camera no longer inadvertently marks ALL other old camera mode samples as current. Each saved camera/mode entry carries its own diagnostic engine and WebView context; historical samples remain readable but are displayed as unknown until retested.
- Diagnostic evidence now preserves old raw results without replacing their original status merely because an unrelated camera was tested. Fresh per-mode evidence alone can be verified in the new engine context.
- Added regression tests for changed WebView runtime, legacy rows lacking their own context, and re-verification of only one lens while another retains stale evidence.
- This is trustworthy bookkeeping, **not** real hardware mode validation. Native Camera2 and physical-device acceptance still require their own verification.

## Multi-hinge posture ordering — 25 October 2026
- The diagnostic fold transition posture now derives from **usable, validated separating hinges** sorted by their actual native coordinates. An OEM callback that reverses the order of the same two hinges cannot fabricate a second fold event when their distinct posture states differ.
- Regression tests cover two hinges in different states with reversed reported order, while preserving their physical geometry and original posture association.
- The observer records geometry/posture only; uninterrupted capture through Android window or Activity recreation still requires physical-device validation.

## Recording probe lifecycle and fold layout scheduling — 25 October 2026
- WebView diagnostic mode recordings now require a real MediaRecorder `onstart` event before a test file can serve as evidence of successful camera-mode recording. A silent encoder or onstop without onstart results in an unknown diagnostic outcome, not falsely verified video support.
- Diagnostic recording startup waits up to four seconds, then attempts safe stop and releases the recorder. A separate bounded overall timer limits stalled stop callbacks. Cancellation removes listeners/timers and cannot mark the recording verified.
- Regression tests simulate a WebView MediaRecorder that produces bytes without onstart, and a healthy recorder that starts and stops with a genuine encoded blob.
- Foldable layout adaptation coalesces repeated mutation/resize events into one scheduled animation-frame measurement without repeatedly cancelling the frame. This prevents continuous DOM mutation bursts from postponing every useful layout measurement.
- These tests are mocked browser/CI checks, not proof of codec FPS, all-frame integrity, physical folding continuity or Android Activity recreation behavior.

## Stale camera track handoff protection — 25 October 2026
- Tracks acquired by the single camera controller are registered in a weak ownership set. After capture release or supersession, delayed slider/focus commands cannot be applied to a previously owned stream even if the OEM camera driver still labels its track live.
- Independently created second-camera tracks are not blocked merely because the primary controller has an owner.
- Added a simulated user capture handoff test for a stale camera setting request; this does not prove correct behavior on a particular OEM driver.

## Selected camera identity verification — 26 October 2026
- Per-lens WebView mode tests require the applied `MediaStreamTrack.getSettings().deviceId` to match the exact requested device ID. Previously an absent ID could be mistaken for a successfully tested selected lens merely because its dimensions and frame rate matched.
- If an OEM browser hides the active device ID, mode verification now remains unknown for that lens, not falsely verified; a mismatched ID is also unknown rather than evidence that the requested lens is unsupported.
- Regression tests cover matching, mismatched and missing identifiers. This is WebView API-level confirmation; physical camera lens identity and real sensor routing still need device-specific verification.

## Native fold observer ownership during rapid screen remounts — 26 October 2026
- Android WindowManager observation uses a unique WebView screen-owner lease. Opening a new camera/editor screen no longer permits a late `stopObserving` from the old screen to close the new screen's active fold listener. The native bridge retains one WindowManager subscription while one or more identified clients still hold leases.
- A disposed WebView screen releases only its own lease, including if its native `startObserving` call completes after unmount. Native Activity destruction clears all owned leases and closes the remaining listener.
- The native stop path tolerates an Android callback-adapter teardown exception. The implementation does not claim Activity recreation continuity or physical fold behavior was tested on actual OEM devices.
- Device-level fold/unfold/rapid-remount acceptance remains necessary. Android APK/AAB compilation is not a substitute for those tests.

## Fold UI owner handoff and dual-recording interruption provenance — 26 October 2026
- Fold screen DOM state and CSS pane measurements now belong to the most recently mounted adaptation instance. Delayed teardown or resize handlers from a previous tab cannot clear/reset the new screen's layout. A regression test mounts two screens, cleans up the old one first, and checks that current viewport properties remain intact.
- Native fold observer owner leases from the previous batch continue to protect overlapping Android subscriptions across rapid remounts.
- Dual-camera stop requests now preserve the first recorded failure cause. A later user stop or UI unmount cannot overwrite an earlier camera-stream-loss reason in the final saved-clips status. A dedicated regression test covers this.
- Neither mocked layout tests nor passing APK compilation prove uninterrupted recording across physical Android Activity recreation; physical-fold and multi-encoder device acceptance remain outstanding.

## Order-independent mixed-orientation folding geometry — 26 October 2026
- Corrected the actual pane partitioning algorithm to process detected native separating hinges in a canonical order. Before this change, a four-region cross-hinge layout could differ if Android delivered the same perpendicular hinge features in reverse order.
- Added a test comparing physical pane rectangles, layout direction and recorded fold evidence for both event orderings.
- This improves reliable Camera/Editor/Settings pane placement and fold-transition evidence, without asserting full compatibility on any specific untested tri-fold hardware.
- Hardware acceptance for folding while MediaRecorder is active, Activity recreation and native camera stabilization remains outstanding.

## Camera evidence levels: encoded FPS is not inferred — 26 October 2026
- A short WebView test clip with a decoded first frame is now classified as `recorded`, not fully `verified`. Stream `getSettings().frameRate` and one decoded frame do not independently establish coded video FPS, all-frame integrity, or frame drops. This prevents falsely advertising a 4K60 verified recording.
- Capture proof retains separately the requested dimensions/FPS, applied MediaStreamTrack settings, first decoded file frame dimensions, output MIME and bytes. A decoded but resized clip remains visible as recorded-only, not verified.
- If settings were applied but encoding failed, status remains `applied` with an explicit error rather than fabricating an unsupported camera. If a file was produced but decoding failed, status remains `recorded` with the failure reason.
- Diagnostic engine context was incremented so older first-frame-only results are not reused as current `verified` evidence without retesting. Regression tests cover 4K60 and downscaled decoded frames.
- Physical measurements of encoded timestamps/FPS, codec frame drops, stabilization, long-running recording and fold continuity still require dedicated verification.

## Mode probe queue resource safety — 26 October 2026
- A video test returning real encoded bytes but no confirmed coded FPS has a dedicated `recorded` queue state rather than `verified` or indefinitely `deferred`. It remains visible in the technical passport without repeatedly opening the camera each time the quick diagnostics panel runs.
- Only explicit full diagnosis can retry already-recorded modes. The user sees separate counts for confirmed modes versus recorded files still missing FPS verification.
- Safe quick probe order prioritizes 1080p30 and 720p30 fallback. These are requests, never invented device support claims. Each result remains tied to its own camera, WebView context, dimensions and requested FPS.
- Added queue tests covering restart persistence, recorded-only status and no false verified count.
- Native, physical camera support, actual codec sample FPS and stabilized output still require corresponding device-side evidence.

## Fold geometry numeric safety — 26 October 2026
- WebView now guards against non-finite native-to-CSS scale factors before using WindowManager hinge coordinates. Invalid/overflowed native dimensions produce a safe standard single-pane viewport with no fabricated active hinge rather than injecting invalid CSS transforms.
- Added a regression test for an extreme malformed native width and an otherwise valid reported fold.
- This is protective fallback, not evidence that particular untested foldable hardware supports all requested layouts.

## Timeout-safe camera settings and fold event chronology — 26 October 2026
- A MediaStreamTrack whose `applyConstraints` call times out is quarantined from further camera setting commands. Timed-out WebView/OEM driver calls may still complete later, so running newer focus/zoom commands against that uncertain track would introduce overlapping changes. Reopen/replace the camera stream before attempting further changes. Added a regression test with a deliberately stalled driver promise.
- During active capture, fold evidence rejects late Android native revisions older than the most recently stored revision. Valid same-revision WebView viewport/region changes remain logged, even when the native tracker revision has not advanced.
- Neither mechanism claims guaranteed device-wide recovery or uninterrupted recording on physical foldables. CI tests prove expected mocked control flow only.

## Stale diagnostic evidence and overlapping fold-screen resilience — 26 October 2026
- A persisted per-camera diagnostic queue state (recorded or verified) is no longer accepted as evidence by itself. When a WebView update or diagnostic engine revision causes the current camera passport to classify old evidence as unknown, the queued mode changes to retry rather than retaining misleading recorded/verified status. Added restart tests for both expired states.
- Recorded-only results remain persisted and are not needlessly repeated in a normal quick scan while CURRENT camera passport evidence is available.
- Window layout classification treats NaN, Infinity and zero-width transitional viewports as compact instead of extra-large. Added tests for invalid widths.
- A superseded fold adaptation instance can no longer overwrite the new screen's fold status if an old asynchronous native listener operation fails.
- Real video coded FPS, long-duration performance, physical fold/unfold continuity, multi-camera synchronization and hardware stabilization remain unverified without device-specific tests.

## Distributed quick lens diagnostics — 26 October 2026
- The quick video diagnostics now select up to two *different WebView camera device IDs*, rather than using both expensive recording probes for two resolutions of the first lens. 1080p30 is tried first and 720p30 remains the next safe fallback; no unsupported mode is claimed.
- Untested modes and remaining lenses stay in the durable queue, and user-approved full diagnostics still process the complete planned set. On later quick passes, the next untested mode on a camera may run without restarting previously recorded-only tests.
- Regression tests cover distinct-lens quick selection, continuation from recorded evidence, and an empty queue.
- Foldable layout changes remain layout-only; physical OEM camera and fold-continuity acceptance cannot be established by CI unit tests.

## Quick per-lens probe distribution and non-fictitious fold events — 26 October 2026
- The bounded quick WebView video mode test now selects one candidate mode for each of up to two **different camera devices** per invocation, instead of consuming its entire allowance on two resolutions from the first device. Pending modes remain in the persistent queue, while full diagnostic mode still covers the planned supported candidates. Tests cover first-pass distribution and continuation after a recorded-only result.
- Fold transitions are now counted by **observable physical posture, effective hinges, panes and pane geometry**, not merely an incremented Android WindowManager revision. New revisions with unchanged physical state update the chronology watermark without adding fictitious fold transitions; older revisions remain rejected. Same-revision real viewport changes remain visible.
- Added tests for revision-only fold notifications, the rejection of stale events and real same-revision geometry changes.
- Neither the bounded test queue nor the fold event log proves recording continuity, precise encoded FPS or compatibility with all physical phones; native and device acceptance is still required.

## Fair camera scanning over repeated quick checks — 26 October 2026
- Fixed a starvation scenario in the bounded video capability scanner: with more than two cameras, repeated quick checks could keep selecting the same first devices. The scanner now chooses at most two distinct cameras with the fewest accumulated recording attempts across their modes, using each camera's least-attempted eligible mode. It preserves the existing cap and does not invent unsupported modes.
- The work is persisted through the per-camera diagnostic queue. A regression test confirms progression from main/ultrawide to tele/front lenses on a later quick pass without needlessly heating the same cameras again.
- Physical foldable and Camera2 recording acceptance remains separate from these automated queue checks.

## Not completed / cannot yet be proven
- A full actual encoded-frame analysis of output FPS/bitrate, all-frame integrity, HDR metadata, EIS/OIS optical performance, colour space and audio fidelity.
- Real native HDR10/HLG 10-bit capture and export pipeline; declared camera/encoder modes alone do not prove functioning HDR.
- Production-grade synchronized simultaneous multi-camera recording, common timeline/audio clock, verified multi-track audio, exact physical-lens choice and sustained heat/battery handling. WebView dual video has no claim of a shared hardware timestamp or guaranteed concurrent-device availability.
- Guaranteed uninterrupted user video during Android Activity recreation, backgrounding, or camera/device transitions. WebView records cannot claim background continuation.
- Complete diagnostic Cartesian compatibility planning with thermal/battery/load gating for every lens+mode+codec and repeat policy.
- Exhaustive per-pane application-wide controls avoidance in connection overlays, cover display third-party access, and vendor-specific multi-window behavior. Editor/settings headers and navigation have pane-relative layout, but physical validation is outstanding.
- Physical device validation on actual book folds, vertical flips, tri-folds and different Android vendors/OS releases.

## Acceptance
A **successful CI build only confirms compilation/tests/packaging**. Neither technical requirements document is complete at 100%. Evidence from actual supported Android devices is required before declaring hardware feature support.
