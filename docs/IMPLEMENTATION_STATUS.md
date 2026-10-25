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
