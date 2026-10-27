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

## Capture fold metadata validation — 26 October 2026
- Measured fold pane geometry in recording metadata is now validated for four finite safe-integer rectangle coordinates, positive width/height, nonnegative top/left, and a bounded number of panes. Corrupted, infinite and zero-area rectangles are rejected instead of being presented as real folding evidence. Tests cover correct and malformed values.
- This validation does not prove uninterrupted physical video capture while changing device posture; frame and file verification remain separate requirements.

## Capture callback ownership and fold-time viewport safety — 26 October 2026
- Single and dual MediaRecorder UI callbacks now verify their recording generation and mounted screen before changing camera state. Old save/decode callbacks may still complete durable file work and refresh the library, but cannot overwrite the current session's recording status.
- Single capture cleanup stops the original canvas/audio processing resources by identity, not a newer session's pipeline after a quick handoff. Added unit tests for the session-generation publishing predicate.
- Foldable WebView layout measurement rejects zero, negative and non-finite viewport dimensions before writing CSS height and window class. Added regression tests. Physical device fold/Activity recreation and native continuous recording remain unverified.
- Android release compilation and browser unit tests demonstrate code consistency, not all-device recording continuity.

## Immediate encoder startup failure and fold revision bookkeeping — 26 October 2026
- A synchronous single MediaRecorder.start() failure now cancels its startup watchdog immediately, clears the old session's timer references and detaches inactive recorder callbacks. The old eight-second callback must not change a later camera recording's UI; live recorders still stop via normal salvage hooks.
- Native fold updates with a newer WindowManager revision are now forwarded to the bounded capture journal even when observable geometry remains unchanged. The journal deduplicates physical transitions but advances its revision watermark, preventing later stale native events from being accepted as fresh geometry.
- Added regression tests for revision-only, unchanged, stale and actual geometry updates. These are software-level tests, not evidence of uninterrupted camera recording on physical folding devices.
- Outstanding physical acceptance: encoded video FPS and full-frame integrity, stabilization effectiveness, long-duration dual-camera capture and Activity recreation during fold/unfold.

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


## Conservative saved-file duration and fold pane authenticity — 26 October 2026
- Ordinary single-camera WebView recordings now retain a monotonic recorder-start observation for a bounded, conservative comparison between elapsed capture time and browser-reported duration of the saved, decoded clip. A substantial shortfall reports a possible truncated file; missing duration, short sessions and non-standard time-lapse/pause cases remain unknown. This never certifies all-frame completeness or codec FPS. Existing durable IndexedDB write and first-frame decode evidence are unchanged.
- Added independent unit cases for strongly shortened output, consistent duration, unreported duration, invalid inputs and speed-altered/abnormal duration. This evidence is advisory, not a guarantee of physical phone performance.
- Fold recording evidence now rejects impossible panes whose coordinate sums overflow the safe-integer range, or whose measured usable rectangles intersect. Duplicate, valid, contiguous nonoverlapping panes remain supported. Added regression tests for malformed multi-pane geometry and rejection before recording metadata is accepted.
- Changes were written only to the independent backup branch. Physical tests, native encoded-FPS/complete-file inspection, long-duration capture, stabilization, dual-camera hardware synchronization and live folding/Activity recreation continuity remain outstanding.


## Confirmed capture-duration clock and trustworthy fold region evidence — 26 October 2026
- Introduced a separate capture-duration clock for single WebView MediaRecorder sessions: it starts on actual `onstart`, stops at the first requested recorder stop rather than after delayed `onstop`/IndexedDB work, and subtracts time from confirmed pause/resume callbacks. Missing, reversed or duplicated lifecycle events produce an unknown duration instead of inventing an accurate recording. Time-lapse/hyperlapse still bypass real-time duration comparisons. Added dedicated tests for pause, stop, missing events and invalid ordering.
- Single-camera file duration display now uses this monotonic capture clock; elapsed time including a delayed encoder callback can no longer be used as a false missing-video warning. Native encoded FPS/full-frame analysis is still outstanding.
- Browser displayed-frame FPS sampling now rejects rolled-back presentation timestamps, duplicate timestamps, decreasing frame counts, non-integer counter values and implausibly high rates rather than sorting inconsistent evidence into an invented numerical estimate. This remains **displayed** FPS, never certified encoded FPS.
- Recording fold evidence checks that the number of measured pane rectangles agrees with the declared usable region count, that hinge count is structurally compatible with the number of panes, and that measured panes are nonoverlapping and safe-integer bounded. Corresponding regression cases were added. Full geometry descriptions are no longer silently truncated by the window adapter; overlength data is rejected by the journal rather than turning into partial false evidence.
- Scope of validation: source modifications and added regression tests. A successful new GitHub Actions APK/AAB build and physical-device testing must be confirmed separately; neither is claimed by these changes alone.


## Observed fold baseline and recorder capture provenance — 26 October 2026
- Live display adaptation now retains an owner-scoped snapshot of the most recent genuinely observed WindowManager/WebView pane topology. Its validity is checked with existing fold geometry and count rules. When either single-camera or dual-camera recording starts, this actual observed topology can be attached as the *pre-capture baseline*, explicitly marked `baseline: true`; unknown data is not invented.
- A fold event after the recording starts can now be compared with the real starting geometry. No fold event is fabricated just because capture begins on an already-open foldable. Owner-guarded disposal prevents cleanup of a previous display adaptation from deleting the newer snapshot. Added tests for ownership, rejection of overlapping bogus panes, a zero-change starting observation, and a genuine subsequent geometry change.
- No native activity lifecycle or encoder continuity is claimed from these passive timestamps. Android re-creation may still interrupt WebView MediaRecorder, and no physical foldable hardware validation has been performed.
- Current batch was committed only to `chatgpt/independent-preview-20261023`; testing and full APK/AAB CI success must be verified independently.


## Dual-camera file-duration integrity and stale fold snapshots — 27 October 2026
- Dual WebView recording now reads durations from each actually persisted, first-frame-decoded video. When recorded duration is available and substantially shorter than the confirmed monotonic encoder-start to stop-request interval, it marks the paired recording as incomplete. It also flags major discrepancies between two saved file durations. Missing container duration remains `unknown`, never proof of synchronization. A stored file remains preserved even when integrity evidence fails; no synthetic frame sync, coded-FPS or complete-decode claim is made.
- Fold baseline observations reject delayed native callbacks with older revisions and preserve the latest owner-scoped measured topology. Continuity summaries explicitly disclose when no pre-capture baseline was available, rather than describing the first observed topology as a confirmed transition from recording start. Added focused regression tests.
- These source changes and regression tests were committed on the isolated branch. New APK/AAB builds, full unit test suite, real sensor/encoder operation, stabilizer fidelity and actual fold/recreation continuity remain **unverified** until CI/hardware evidence is available. No changes to `main`.


## Recorder-confirmed fold capture provenance and truncated-file status — 27 October 2026
- Single-camera fold event journaling now begins only at the real MediaRecorder onstart confirmation, not during preparation. The first baseline is sampled from the most recent measured display geometry at that moment; pre-capture changes do not masquerade as in-recording transitions.
- Dual-camera fold event journaling similarly begins only after BOTH independent MediaRecorders report onstart. Fold observations before the second encoder starts and after a stop request are ignored. This makes observations conservative and still does not imply synchronized frame-level timestamps.
- A stored single-camera video with a decoded first frame but a substantial duration shortfall is now visibly classified as an error/incomplete verification rather than retaining an unconditional saved/success status. The shortfall warning is also preserved when displayed-FPS sampling is unavailable. The original saved media remains untouched.
- Important limitation: the source changes are not a substitute for successful GitHub Actions tests, real-device long recordings or true continuity across Android Activity destruction. Keep the two-document estimates at 85%/86% until these tests provide independent completion evidence.


## Bounded post-save frame checkpoint verification — 27 October 2026
- Implemented a separate local WebView checkpoint probe for SAVED video media blobs, seeking to ~45% and ~85% of duration and requiring a real decoded `requestVideoFrameCallback` frame with a nearby presentation timestamp, positive decoded dimensions and a bounded timeout. This is explicitly NOT a full container scan, proof of all frames, true codec FPS, or hardware stabilization. WebView variants without seek/frame-callback support return "unavailable" without mislabeling the file corrupt.
- Integrated late-frame checks after read-back and first-frame checks for single-camera and two-camera recordings. Dual-camera summary distinguishes clips with observed later decoded samples from unsupported/unavailable checks; it does not infer precise inter-camera frame synchronization.
- Added focused tests for checkpoint planning, unavailable duration and truthful status. Continued to preserve all original saved blobs on verification failure, without any network services or model downloads.
- Single-camera fold capture journaling now stops collecting additional topology changes at the encoder stop request rather than allowing delayed onstop/IndexedDB operations to be counted as active capture.
- Source changes on the independent branch require full CI suite and real hardware verification; user-facing overall readiness 85% camera / 86% folds remains a conservative historical estimate, not newly proven percentages.


## WebView recreation UI recovery and truthful interrupted capture — 27 October 2026
- Added bounded local persistent restoration of UI-only fields: selected tab, editor playhead, edit mode, aspect ratio and photo/video selector. Stored values are validated; no camera ownership, recording flags, permissions, encoder, or purported hardware capabilities are resumed from stale localStorage. This applies to Android Activity/WebView recreation as well as normal relaunches.
- A lightweight marker is written only after confirmed MediaRecorder start (single or dual mode) and cleared once a saved recording passes IndexedDB durable read-back. If the WebView is destroyed unexpectedly, the marker survives and the next app load displays an explicit warning that earlier capture might have been interrupted and media should be checked. Marker is not a video file, and no continued recording or automatic recovery is claimed.
- Added regression tests for safe UI field filtering and capture marker validation/clearing. All logic is local/offline; no additional downloads or servers.
- Still outstanding: physical fold tests, native encoder surviving Activity recreation, robust out-of-process video recording, real encoded-frame FPS and continuous frame/audio validation. New APK/AAB CI and the full test suite have not been confirmed for this batch.


## Microphone and video-track loss during capture — 27 October 2026
- Single WebView recorder now watches the original camera and microphone input tracks while capture is active. On an ended input track, it records the specific interruption reason, requests bounded MediaRecorder finalization, and attempts to preserve already emitted media bytes as an incomplete recording instead of silently assuming sound/video continued. The event handlers are removed on normal finalization and synchronous startup failure.
- Two-encoder dual WebView recording now observes audio as well as video source tracks, stops both encoders on loss of either input, and reports whether audio or video was lost. Existing independent clip salvage, durable storage and decoder checks remain unchanged.
- Added tests for distinguishing lost mic versus lost video in single/dual capture. These are source changes and regression cases, not confirmed hardware results. Full CI, Android APK/AAB and real microphone unplug/routing/fold tests still require external validation.


## Mode-specific stabilization policy and WebView page-exit warning — 27 October 2026
- Added conservative per-camera/per-resolution/per-FPS recommendation policy based on actual Android Camera2 CaptureResult probe outcomes. Test-confirmed EIS takes priority, otherwise test-confirmed OIS; additional simultaneous software stabilization stays off by default. Software fallback is merely eligible for later performance testing when EIS/OIS were explicitly reported unavailable. Unknown/camera-busy/unmatched modes remain unknown. This is not an active camera encoder stabilization implementation, and cannot certify stabilization of WebView recordings.
- Camera Diagnostics displays the result with that limitation, rather than equating any Camera2 test-mode result to a proven actual video file. Added focused tests of mode identity, EIS/OIS precedence, and unknown/unavailable cases.
- On WebView `pagehide`, CameraTab attempts bounded recorder shutdown/salvage in addition to handling `visibilitychange`; a sudden process death cannot be guaranteed to finish saving data and the durable warning is deliberately preserved.
- Interruption warning after a WebView/Activity recreation is now shown in Editor and Settings too, not only Camera. No camera is automatically reactivated from stale stored state.
- These are committed source changes; hardware tests, full CI, and encoded video stabilization remain outstanding; do not advance overall completion percentages absent independent validation.


## High-speed bitrate and MP4 timestamps; fold UI persistence performance — 27 October 2026
- Android Camera2 native high-speed recorder bitrate arithmetic now uses 64-bit multiplication, conservative bounds, and a valid positive 32-bit encoder target; a 4K high-FPS multiplication no longer silently overflows to a negative MediaRecorder bitrate.
- Android MediaExtractor video evidence now tracks duplicated and reversed sample presentation timestamps and does not emit a misleading estimated FPS from malformed sample chronology. Bounded samples still do not prove entire video continuity.
- Editor/view restoration no longer synchronously writes the playhead to localStorage on every update: writes are coalesced within 400 ms, with navigation changes, pagehide, visibility loss, and unmount flushing the latest snapshot. Corrupt primary preferences no longer prevent independent restoration of valid UI-only state.
- Added a 36-scenario acceptance matrix at `docs/FOLD_AND_CAPTURE_ACCEPTANCE_MATRIX.md` grounded in both specifications, with physical hardware and APK checks explicitly **NOT VERIFIED** until performed.
- The full Vitest suite and Gradle APK/AAB build were NOT run in this environment (repository clone failed on DNS resolution for github.com; node_modules are absent). Source commits and GitHub branch existence are verifiable independently. No physical testing or unsupported completion percentages are claimed.


## Late-frame seek verification and interruption accounting — 27 October 2026
- Saved-video checkpoint inspection now waits for actual HTMLVideoElement metadata before seeking, with a bounded timeout, then requires a matching decoded frame and valid output geometry. Autoplay rejection alone is not called media corruption; unknown WebView capabilities remain unknown. Added regression tests for stale frame timestamps and invalid frame dimensions.
- Fold continuity summary no longer silently reports zero transitions when the initial capture baseline was absent: it discloses unknown earlier activity and counts the actually observed events. A baseline remains distinguished from in-recording transitions.
- In simultaneous two-camera recordings, the previous unfinished-capture warning is retained if no media clip was durably saved. The app does not claim successful recovery from a crashed/aborted encoder.
- No full Vitest/Android build has been observed for these changes. Source commits are confirmed on the isolated branch; hardware behavior and true codec FPS remain unverified.


## CI failure root-cause repair — 27 October 2026
- Independently retrieved actual GitHub Actions run #319 (40397397407) for commit `449b26c0`: 12 of 159 Vitest tests failed (147 passed); the APK/AAB steps were skipped. Eleven failures were the lifecycle test double missing the standard `MediaStream.getTracks()` method after microphone-loss handling was added. One failure was an outdated fold summary assertion expecting one transition while the now explicitly uncertain, no-baseline chronology reports two observed states.
- Updated the dual-recorder test mock to implement getTracks/getAudioTracks plus valid video track kind, preserving real audio/video source monitoring; adjusted fold chronology test to assert the exact no-baseline uncertainty semantics rather than a misleading substring. Workflows for these branch commits were triggered automatically. Do not claim full CI or APK success until the run completes successfully.
- Real physical-camera and foldable-device tests still outstanding; 85% and 86% are historic planning estimates, not measured coverage.


## Long fold recording baseline, real audio-track metadata, stale native callbacks — 27 October 2026
- Long single/dual capture fold journals retain the **original measured pre-capture baseline** even after more than 120 valid observations. An explicitly counted set of older observations is dropped to bound metadata without falsely resetting the starting posture; regression coverage includes deduplicated and truncated observations. This does not prove uninterrupted encoded frames.
- Android app-owned high-speed MP4 inspection now enumerates actual `MediaExtractor` audio tracks and the first audio MIME type. The result explicitly states that audio samples have NOT been decoded or verified; high-speed video may intentionally have no audio. Existing bounded video-sample FPS metadata inspection remains separate.
- WindowManager native bridge now rejects delayed callbacks from a prior observer lifecycle using a monotonic generation token, including Activity/React teardown/restart races. The observer generation is invalidated during stop and the new owner's lease is established before listener registration.
- GitHub Actions automatic tests and Android APK/AAB remain the source of build verification. Initial batch run exposed a single test expectation error for a deduplicated first fold reading; corrected based on the actual 160-case test output. Physical-device testing is still outstanding.


## Privacy-preserving camera passport export — 27 October 2026
- The explicit «Скачать паспорт» action now produces a **local, allowlisted, anonymous JSON report** rather than dumping raw Camera2 physical IDs, WebView device IDs, camera labels, user agent, native file paths, or raw error text. Separate pseudonyms are created for Camera2 and WebView namespaces, which must never be assumed interchangeable. No media bytes are included and no upload/server request occurs.
- The export preserves requested and applied mode dimensions/FPS, outcome, decoded file dimensions/bytes, native capability declaration summaries, bounded MP4 frame timing evidence and audio track count, explicitly without declaring actual sensor FPS/HDR/EIS/OIS verification. Added tests ensuring identifying strings do not leak.
- Completion percentages 85/86 were never linked to a measured requirements checklist and must not be treated as measured software readiness. Actual proven evidence includes full CI tests/build and the named cases in `docs/FOLD_AND_CAPTURE_ACCEPTANCE_MATRIX.md`; foldable hardware field tests still need physical devices.


## In-window fold geometry verification — 27 October 2026
- Native WindowManager fold rectangles whose bounds extend outside the actual Android application window are now rejected instead of clamped into invented usable panes. The pure geometry tests include horizontal/window overflow and valid baseline folding features. This prevents off-window OEM data from altering the editor or camera controls.
- No physical tri-fold hardware was available; automated regression tests cover only synthetic input shapes while the implementation consumes real reported features in production. Actual camera/encoder continuity and fold touch coordinate correctness still require on-device validation.


## Saved MP4 tail samples and rotation metadata — 27 October 2026
- Native Camera2 high-speed MP4 inspector now reads bounded MediaExtractor samples near the container-declared end, separately from its initial 600-sample window. It reports near-end sample positions, timestamp ordering and approximate sampled FPS. Unsupported seeking or missing duration remains unknown; `fileEndVerified=false` prevents any full-file verification claim.
- MediaMetadataRetriever reads MP4 rotation metadata (0/90/180/270 or unknown) without claiming correct preview mirror, overlays or rendered export orientation.
- Camera Diagnostics shows head/tail sample evidence and orientation. Anonymous report includes numerical observations, never file paths or raw lens IDs. CI and real-device status must be confirmed separately.


## Fold window-resize versus observed hinge posture evidence — 27 October 2026
- The video capture fold event summary now separates WindowManager-reported posture/hinge/layout changes from **geometry-only** WebView viewport or window resizing. Such a geometry-only event can no longer be presented as physical folding evidence. An original pre-capture baseline and bounded loss/omission counting still apply.
- Added tests for a pure CSS geometry change and an actual reported posture change. These software tests do not verify a real manufacturer's fold sensor, recording continuity or touch mapping on an actual handset.


## Mode-specific Camera2 high-speed passport and fold animation coalescing — 27 October 2026
- Successfully saved native Camera2 high-speed MP4 now produces separate **recorded** mode evidence in the camera passport indexed by Camera2 camera ID, exact requested dimensions and FPS. Actual file dimensions and bounded head/tail sample data inform the result; unverified encoded FPS never becomes a fully verified mode. Camera2 and WebView ID namespaces remain distinct. Tests cover mismatched output, unknown tail FPS and missing file.
- Continuous hinge/resize/orientation bursts now share one requestAnimationFrame layout recalculation rather than repetitive synchronous geometry writes on every event. Initial and native observations remain immediately applied and teardown cancels the pending frame. This is a performance change, not a guarantee of recording continuity on physical hardware.
- Completion percentages are explicitly provisional estimates, not measured total requirement coverage. Real foldable device and video stabilization tests remain outstanding.


## Conservative diagnostic resource budget and transient fold viewport safety — 27 October 2026
- Extended or quick camera diagnostic loops now limit a user-triggered run to one real recorded probe whenever thermal state, battery charge, or remaining storage estimate is unknown; the remaining persistent test tasks stay queued rather than mislabelled unsupported. Clear danger/low-resource signals defer all tests. Added unit coverage of the budget decisions.
- During transient zero/NaN WebView viewport size in an Activity/fold transition, the layout uses the previously measured valid dimensions for its size classes and does not recalculate fold region geometry from invalid coordinates. Real measured sizes resume normally when available. Added regression tests.
- Status estimates remain provisional: camera/recording 86% completed and 14% outstanding; foldables 87% completed and 13% outstanding. These are continuity estimates from previous reports, not objective verified coverage. Continue to report both, but do not silently equate successful CI with physical fold/stabilization tests.


## Recorded MP4 audio samples and long-fold summary evidence — 27 October 2026
- Native MP4 inspection now enumerates up to 300 actual encoded audio track samples (if present), recording timestamp ordering, duplicates and first/last time. Audio fidelity, full coverage, and playback are explicitly NOT verified; silent high-speed modes may have no audio track by design. The anonymous local diagnostic report includes numerical samples, not file paths or personally identifying names.
- Long folding capture evidence now preserves the classification of early posture/hinge versus window-only transitions even when older history entries are pruned at the 120-event bound. A new regression test simulates 140 transitions; the first is geometry-only and the following 139 change posture. Do not infer physical hinge changes from CSS resizing.
- Previous estimates retained: cameras/recording **86% done, 14% remaining**; foldable work **87% done, 13% remaining**. These estimates remain approximate and do not substitute for physical hardware/encoder verification or a full acceptance audit.


## Real original video download and interrupted fold capture recovery UI — 27 October 2026
- Replaced the previous export drawer's **synthetic progress timer and JSON render manifest** with a real offline download of the actual video Blob from IndexedDB for exactly **one complete, unedited source clip**. The media must exist durably. The new UI truthfully identifies the operation as **download original**, not a transcoded output. If cuts, effects, colour, crop, overlays, transitions, hidden/muted audio/video or multiple items are present, it explicitly refuses rather than silently discarding edits. A production timeline compositor, sound mixdown, 4K encoding and actual application of user-selected output settings **remain UNIMPLEMENTED**. Automated tests cover the supported/refused cases. Original video includes its original audio track, if any.
- On WebView/Activity recreation with an unfinalized capture marker, the app now offers an explicit **check clips** action opening Editor media library. Only explicit acknowledgement clears the durable warning marker; capture is **not** automatically restarted or falsely declared continuous. Continued recording still requires the user's new recording action and is a new segment, not a seamless native recording.
- These are material user-visible behavior changes, not yet a complete closure of full video export or native recorder continuity. Continue the historical approximate camera 86%/foldable 87% for report comparability until objective requirement coverage and physical test evidence justify changes.


## Genuine video-original export and fold-driven Editor project restoration — 27 October 2026
- The previous Editor export drawer showed an animated timer and generated `multicam-render-manifest.json`. Replaced it with an explicit in-app renderer bridge to the currently open editor. For **one entire unmodified video clip**, the app reads the real original media Blob from IndexedDB and downloads a playable source video with the source's original soundtrack if present. It is a copy of the real media, NOT a re-encoded file. For multiple clips, cuts, transitions, filters, crop, overlay, hidden or muted track, output resolution/fps/codec changes, a compositor and encoder are still required. The UI states these limitations; no synthetic success or progress is shown.
- Added focused original-export acceptance tests against cropped, muted, multi-item or otherwise edited timelines. Other advanced paths are deliberately refused instead of silently discarding work.
- WebView/Activity death leaves a durable unfinished-capture warning; the restored app now offers **Inspect Clips** to open the editor media library. Dismissal of this warning requires an explicit user action; the old recorder is never restarted automatically or falsely labelled as continuous.
- Editor now persists its own clip timeline placements, text overlays, transitions and hidden/muted lanes in bounded, locally stored, validated, allowlisted project metadata. Source media bytes remain in IndexedDB; editing UI changes survive Activity/WebView recreation when local storage is available. Restoration cannot prove active camera/encoder continuity.
- Still unavailable: full offline timeline compositor/audio mixer/transcoder honoring all selected codec/resolution/FPS and effects, native persistent recorder surviving process/WebView destruction, stabilization applied in actual camera output, and physical fold-camera continuity verification. Never claim these from the implemented original-copy export or recovery of editor state.
- Historical progress estimates before this batch: Cameras/recording 86%; folds 87%. Subsequent increases, if any, are provisional planning estimates until every acceptance item is weighted and physically verified.


## Actual offline single-clip WebM compositor, not simulated progress — 27 October 2026
- Added a separate local `editor-webm-render.ts` path invoked by ExportDrawer through the existing editor bridge. For ONE video segment it decodes a source file locally, seeks to the selected in-point, paints decoded frames to canvas with trimming, bounded playback speed, basic supported visual looks, spatial crop/scale/position and title overlays, combines with a WebAudio media-element audio track, and encodes an actual WebM VP8/Opus file with browser MediaRecorder. Percentages reflect playback media time, not fabricated timers. Unsupported codec / WebView encoder features and renderer errors are shown to the user; original video remains intact.
- Conservative limits: one clip, <=120 seconds, no reverse, transitions, separate audio lanes, timeline multitrack mix, advanced color adjustments, H.264/HEVC/4K claims, or full effect parity. Invalid edits must not be dropped silently. Selected VP8 can enable the rendered path; an unmodified full clip can still be downloaded byte-for-byte from IndexedDB. A release APK build does not establish successful video rendering on all physical Android WebViews.
- Added unit tests for render planning (trim, workload bound, unsupported combinations) and made VP8 an explicit export choice. For foldables, rendering remains an in-WebView task; it is NOT persistent across Activity destruction. Existing editing project save/recovery and interrupted capture messaging are retained.
- Historical planning figures remain 87% cameras/recording and 88% foldables before this batch, pending a proper acceptance-criteria weighting and physical verification. Do not raise these solely because the code compiles.


## Export lifecycle safety and actual WebM output settings — 27 October 2026
- Offline single-clip WebM rendering now uses output canvas dimensions tied to the chosen supported aspect ratio (16:9, 9:16, 1:1 and 21:9). The WebM video bitrate is passed to MediaRecorder from the validated export setting instead of being hard-coded. Unsupported codecs, bitrates, resolution and frame-rate selections are rejected rather than silently ignored.
- Export Drawer now supports explicit cancellation, cancels the AbortController on close/unmount, and the renderer attempts to halt the decoder and encoder on cancellation, background page visibility or bounded timeout. Early media-ended events are treated as interruption rather than successful export. Added regression tests for dimension/bitrate policy.
- These changes harden a real single-clip, local Canvas/WebAudio/WebM pipeline. They **do not** implement multitrack export, prove precisely 30 encoded FPS, preserve renders across WebView destruction, or establish native camera stabilization and continuous physical-fold recording. Real-device validation remains required.
- Planning estimates held at Cameras 87% (13% outstanding) and foldables 88% (12% outstanding) pending a measured acceptance audit and hardware tests.


## Sequential 2–8-clip WebM export — 27 October 2026
- Added a real offline path to render up to eight contiguous hard-cut clips from the **same** video lane into one VP8/Opus WebM. The plan rejects gaps, overlaps, different lanes, disabled video/audio, transition effects, speed changes, color adjustments and other unsupported operations so user edits are not silently discarded. The renderer loads source Blobs from IndexedDB, drives one Canvas capture stream and one WebAudio MediaElement source for actual output.
- The encoder pauses during clip source switching and resumes after metadata/seek; progress reflects actual source presentation time and cancellation/page hiding ends the attempted export. Maximum combined timeline is 120 seconds. Source videos stay untouched.
- Added planning tests for real sequential ordering and refusal of unsupported timelines. Device-level A/V splice quality, pause behavior and exact frame continuity on OEM WebViews are **NOT VERIFIED**. This is not concurrent multitrack mixing or native recording surviving Activity destruction. That foldable-camera acceptance requirement remains outstanding.
- Prior approximate progress remains camera/recording 87% done, 13% left; foldables 88% done, 12% left until hardware and acceptance verification. Do not treat compilation alone as completed phone-level recording continuity.


## Editor simultaneous video-layer preview — 27 October 2026
- Replaced the Editor's single-source video monitor with one independent HTMLVideoElement decoder per concurrently active visual video track. With no video selected the monitor composites active video layers in ascending track order (higher-numbered layers display above earlier ones); when a particular video clip is selected, only that selected clip is shown. Audio/title selection does not hide video layers. Each layer has its own source/time mapping, seek/playback behavior, transform/crop/look, and on-unmount decoder cleanup. The existing independent audio preview remains in place.
- This addresses the Camera/Editor timeline requirement to show all video tracks together when none is selected, without falsely claiming that full multitrack exporting has been implemented. Multiple physical decoders can still overload lower-end Android WebViews; phone performance, physical fold orientations, and encoded mixdown have NOT been verified.
- Project stays in the isolated branch; main unchanged. Previous indicative figures (camera/recording 87% complete, foldables 88%) remain unverified approximations until acceptance audit, and do not imply tested device support.


## Actual Android-owned recording across UI replacement — 27 October 2026
- Implemented `NativeCaptureService`, a real opt-in Camera2 + Surface MediaRecorder MP4 recording pipeline in a **foreground Android Service**, with an ongoing notification and an Android-side Stop action. Camera/microphone foreground service permissions are declared. It runs independently of Activity/WebView configuration changes and is not an emulated recording.
- Added a real `NativeCapture` Capacitor bridge with start, stop, state restoration and permission handling, registered with `MainActivity`, and a Settings-panel UI to select a discovered camera, recorded size, 24/25/30/60 FPS and optional audio. The service checks true Camera2 MediaRecorder output sizes and reported FPS ranges before attempting video. CameraTab refuses to re-acquire the WebView camera while the native service owns it.
- The recorder attempts system EIS first, else OIS, on the **actual Camera2 TEMPLATE_RECORD repeating request** (not merely in a separate diagnostics screen). Its CaptureCallback reads the applied stabilization fields where the driver exposes them. If unavailable, the user sees an unconfirmed state, not a fabricated result; actual file-based stabilization effectiveness remains unverified.
- Completed MP4s are finalized by MediaRecorder and published into `Movies/MULTI-CAM POV` via MediaStore. If publication fails, the private-app copy is kept and the UI reports the limitation. Native camera loss can salvage a completed partial MP4 but marks `saved_interrupted` rather than falsely claiming continuous recording. Process death may still terminate the OS Service; persisted status then reports an interruption, never guaranteed continuity.
- Camera and editor WebView capture are **not** seamlessly migrated into the native service, and a WebView preview is not supported concurrently with service-owned Camera2. Use the explicit Settings recording controls. Background camera starts are subject to Android version/foreground-service restrictions.
- This is a major architectural implementation toward both specifications, but actual fold/unfold video frame continuity and stabilized recorded output **must be tested on physical phones**. Software compilation alone is not device acceptance. Historical approximations before this implementation were cameras 87% / folds 88%; provisional code-progress estimates after compiling this implementation may be 89% / 90%, but they are not measured acceptance coverage.


## Camera2 MP4 orientation and bounded native startup — 27 October 2026
- Foreground-service Camera2 recorder now sets MediaRecorder MP4 orientation hint from the chosen sensor's CameraCharacteristics.SENSOR_ORIENTATION, current Android screen rotation and front/rear-facing direction. The hint is frozen at the start of each MP4: fold/unfold or Activity resizing does not mutate the existing file's rotation metadata. The selected value is exposed through the NativeCapture status bridge and Settings UI; this does not claim all preview overlays/mirroring are verified.
- Opening a Camera2 service session now has a 12-second scheduled startup failure path to prevent an unresponsive OEM camera driver leaving a foreground recording indicator indefinitely. Opening timeout is removed once the recorder starts or finalization begins. These are user-facing capture reliability improvements, not synthetic diagnostics.
- Actual physical orientation and uninterrupted recording across a true fold still require device testing. Historical 89% camera / 90% foldable are planning estimates rather than audited acceptance coverage.


## Native recording pause, fold-restored session settings and recorded clock — 27 October 2026
- Android Camera2 foreground service now supports explicit `ACTION_PAUSE` and `ACTION_RESUME` while retaining the same native MediaRecorder, MP4 and Camera2 session. New Capacitor methods expose the controls. Paused sessions continue to own the physical camera and prevent WebView takeover.
- Active native recording now publishes and persists **real selected cameraId, width, height, FPS, start time, excluded paused time and logical recorded duration**. A recreated Android Activity/WebView can restore controls and current session state without opening another camera or silently resetting the duration. UI has pause/resume and displays the recorded elapsed seconds. OS process destruction still interrupts the service; no false promise of survival.
- Added a TypeScript checking stage in CI and uncovered approximately 170 legacy errors missed by unit tests/Vite build. Fixed the actual misuse of `useCameraStore` selector in CameraWorkspace to `useMulticamStore`, and a high-speed evidence input width/height type problem. The full legacy type audit remains visible but temporarily non-blocking so APK releases can continue. This is explicitly **not** a claim that TypeScript has zero errors.
- Under the **prior planning-only** estimates, these are substantive source-level steps equivalent to +1 percentage point per document: camera and recording 90% (10% estimated remaining), foldable lifecycle 91% (9% estimated remaining). These are NOT calculated fractions of completed acceptance points; no new physical device validations have been reported. Do not imply verified hardware support.


## Native Camera2 in-record preview and fold visibility lifecycle — October 27, 2026
- NativeCaptureService now optionally attaches a **small YUV_420_888 ImageReader output** alongside the actual MediaRecorder recording surface in one Camera2 capture session; ImageReader samples are converted to bounded 55-quality JPEG in memory and exposed through a Capacitor previewFrame request (no internet or file downloads). The Camera UI displays those images while native recording is running. This is sampled still-frame preview, approximately limited to a few updates/second, **not** a full frame-rate SurfaceView and not a pre-recording viewfinder.
- Native preview ownership follows the React camera panel visibility: setPreviewVisible(true) while displayed; disable JPEG processing on page hide/tab unmount/fold-driven Activity recreation. The actual recorder remains owned by Android Service. The opt-in preview's decoder output must not force getUserMedia WebView ownership.
- Camera2 devices that reject the encoder+YUV output configuration are retried with **encoder-only** outputs. In that case MP4 capture remains available but the extra preview cannot be promised. Real device confirmation is still pending, notably frame orientation, dropped-frame load, concurrent surface constraints and fold/unfold continuity.
- These are two concrete advances in the first document (record-time native viewfinder) and second document (UI-owned preview resources can be discarded independently of native ongoing MP4). Prior 90% / 91% estimates are not objectively weighted and should not be auto-increased by CI success alone.


## Native Camera2 pre-record viewfinder + fold-safe camera lease — 27 October 2026
- NativeCaptureService now has an explicit `ACTION_PREVIEW` mode which opens selected Android Camera2 lens using one YUV ImageReader without creating any MP4 or touching WebView getUserMedia. The Settings/Camera native panel offers **Open viewfinder** before recording, and keeps the previous in-record frame monitor.
- When the user starts recording from preview, the same Android foreground service releases its preview-only capture session and reconfigures the same logical camera ID for MP4 H264/AAC recorder recording. New `startPreview` Capacitor method and service state `previewing` prevent opening a second camera owner. Main camera-mode switching refuses takeover while the service is previewing or recording.
- If the camera loses its preview-only session, stop/cancel/error should close camera surfaces and return a truthful no-file state. The UI may be safely unmounted during Activity resize/fold, while Camera2 service ownership remains native and independent of the responsive UI.
- Hardware performance and the handoff's exact black-frame/focus/rotation behavior are NOT VERIFIED on actual OEM devices. The preview is intentionally bounded, JPEG-based and not 30/60fps SurfaceView. The service recreates its Camera2 capture session when starting MP4, so a brief viewfinder interruption is expected; once recording, merely changing screen geometry must not recreate the service.
- Previous approximate implementation estimates 91% cameras and 92% foldables remain continuity estimates rather than objective acceptance scores. No increment is claimed solely for adding code without device verification.


## Real native Camera2 lens controls and fold-safe UI — 27 October 2026
- Implemented actual Camera2 optical-capture controls on the foreground service's current repeating preview/recording request: digital zoom through SENSOR_INFO_ACTIVE_ARRAY_SIZE crop, bounded by SCALER_AVAILABLE_MAX_DIGITAL_ZOOM; AE exposure compensation bounded by CONTROL_AE_COMPENSATION_RANGE and the device's compensation step; physical torch through CaptureRequest.FLASH_MODE_TORCH only for cameras advertising FLASH_INFO_AVAILABLE. Controls remain in the native Service while folding the UI and carry over during the pre-recording viewfinder → MediaRecorder reconfiguration. The controls are **not** fake CSS effects, no internet required.
- NativeCapturePlugin exposes setControls/setTorch with validation and resolves only after setRepeatingRequest succeeds, so the UI does not immediately claim an unaccepted setting. Camera panel adds zoom, exposure sliders and a conditional flashlight button. On unsupported lenses these controls are disabled/unavailable instead of faked.
- Recorder-only fallback on OEMs refusing simultaneous JPEG/YUV preview now retains crop, exposure, continuous video autofocus and requested EIS/OIS in the recording capture request. Previously fallback could silently drop these important recording settings.
- Fold/split narrow panes change the camera settings and control grids from two columns to responsive one/two-column layout. This does not claim that all physical tri-fold screen postures are verified.
- Hardware validation (actual zoom FoV, torch while recording, EIS/OIS file result, and fold transitions) remains pending. Prior 92% and 93% implementation estimates are provisional, not formal acceptance scores.
