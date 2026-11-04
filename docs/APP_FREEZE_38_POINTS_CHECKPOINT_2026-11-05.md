# MULTI-CAM POV — 38 freeze findings: validated actions and remaining risks
Date: 2026-11-05. Branch: `chatgpt/independent-preview-20261023`.
Main is untouched. Camera/fold specs remain paused: camera 91.86%, foldable 76.39%, combined 84.81%.

This is a **code-focused checkpoint**, not a claim of emulator/phone stability.
The 38-number inventory below comes from the user-provided external audit.
"Mitigated" means an actual code change is present; "risk" is not proof
of the cause of a particular observed freeze. Do not delete, disable, degrade
or silently change the semantics of recording, original files, effects,
camera controls, dual cameras, editing, exports or fold support.

| No. | Finding and independent verdict | Verified disposition |
|---|---|---|
| 1 | First WebView frame after force-close: possible platform delay, not necessarily freeze | Existing first-JS-heartbeat diagnostic; still needs an actual JS/render log |
| 2 | Sync storage JSON read: small bounded data can delay first paint, cannot prove 12s freeze | Existing 2KB immediate preferences, deferred <=256KB legacy hydration; no destructive reset |
| 3 | StrictMode duplicates **production** mount: incorrect premise | No change; production StrictMode does not intentionally double-run effect checks |
| 4 | Splash may hide UI awaiting saved capabilities | Existing 80ms recovery fallback, no automatic camera probe; no feature removed |
| 5 | Initial bundles/fonts can burden slow GPUs: needs measured profiling | Editor is lazy; fonts not removed, no unsupported size/performance claims |
| 6 | Emulator camera/Camera2 HAL may hang | Existing browser request deadline, new native bridge per-command deadlines; missing answer is UNKNOWN |
| 7 | Camera cleanup may overlap Settings transition | Settings directly mounted, rather than retaining both camera and settings animation DOM; monitor cleanup separately |
| 8 | Blur and theme painting can be expensive | Existing native-WebView blur mitigations; retain user-approved reference design 111/222 |
| 9 | Sync theme storage and restyle | Lightweight (2KB max) prefs, deduplicated store updates and geometry; still needs WebView profiling |
| 10 | IndexedDB proxy cache measurement | User-initiated only; does not run automatically when Settings opens |
| 11 | Camera2 and diagnostics inside Settings | Tools lazy and opt-in; never start their polling simply on Settings entry |
| 12 | Network diagnostics | On explicit button, bounded; peer handshake cleanup improved |
| 13 | JS fold geometry feedback | Existing RAF coalescing, root dataset and CSS writes only on changes; listeners still active |
| 14 | Native WindowManager callbacks | Existing no-op fingerprint filtering, recording observations still processed |
| 15 | Canvas capture copies too often | Added phase-locked requested-FPS draw scheduler without changing resolution, profiles or recording options |
| 16 | FalseColor pixel conversion | Existing 240px/15fps processing and reused canvas, feature kept |
| 17 | AudioRail over-updates | Existing 25Hz audio analyzer/React state cadence, no removal |
| 18 | Face detector sends too many focus controls | New change threshold, single in-flight focus request and periodic refresh; face and hybrid-center retained |
| 19 | Dual cameras stress codecs | Existing separate dual streams and cleanup, risk on emulators; no single-camera downgrade |
| 20 | Clip save/copy/readback | IDB write and readback deadlines, original-clips-preserving add-only transactions, sampled bytes not full-file equality |
| 21 | Bridge telemetry polls | Existing coalescing and bounded Android metrics, not disabled |
| 22 | Full-video audio decode allocates whole Blob | **OPEN HIGH-RISK**: audio analysis still uses full `arrayBuffer()` and `decodeAudioData()`; naive timeout cannot stop allocation. Needs a genuine incremental audio-decoder design, not suppression of waveform |
| 23 | Automatic 480p proxy encoding for all library items | Changed to timeline-referenced clips only, serial pipeline, phase-locked 24fps, clear-cache regenerates needed derived media; originals retained |
| 24 | React time updates at 30Hz | Existing memoized lanes and visible ruler ticks; further profiler-guided optimization possible |
| 25 | Multiple decoder instances for simultaneous layers | Core multi-layer compositing remains. **OPEN risk** of decoder exhaustion, must not drop layers as an alleged fix |
| 26 | Editor project JSON initial parse | Existing one-time ~220KB bounded/sanitized load, no uncontrolled per-render reparse |
| 27 | CPU/GPU intensive export | On explicit user export; real encoding preserved, not automatically started |
| 28 | createCaptureSession allegedly under STATE_LOCK | **INCORRECT**: only the surface pointer is acquired under that lock; session creation happens after it |
| 29 | Shared STATE_LOCK may introduce lock contention | Native status worker and command worker, Camera2 service lock remains; profile with native stacks before invasive refactoring |
| 30 | SharedPreferences commit by freeze watchdog | Monitor persists only on its daemon thread, not Android main/UI, retain evidence |
| 31 | Camera foreground service/HAL may be delayed | Existing service worker and opening deadline, native JS bridge deadlines avoid indefinitely busy controls |
| 32 | JPEG base64 preview bridge payload | Polling is bounded/in-flight limited and opt-in for native tools; no removal of preview |
| 33 | MP4 MediaExtractor validation competition | Native inspection in dedicated MP4 worker and lifecycle shutdown, service audit work still a profiling risk |
| 34 | No android:largeHeap supposedly causes all WebView freezes | Unsupported fix; Java heap flag does not guarantee WebView renderer/V8 or GPU memory |
| 35 | Low storage / flash stalls | Existing storage-monitoring, durable writes never silently discarded or duplicated |
| 36 | Thermal throttling | Environmental possibility, no measured thermal causal evidence or automatic feature reduction |
| 37 | Emulator has slower renderer/camera/codec | Treat as test scenario, not a reason to disregard actual freezes; preserve hardware features |
| 38 | Capacitor bridge saturation | Bridge Camera2 calls bounded; late listener cleanup and no duplicated outstanding previews; measure actual payloads and stalls |

## Fixes implemented in this pass
- `src/lib/native-capture.ts`: no unbounded JS wait for Camera2 commands and permission requests; late native listener handles are cleaned up. A timeout is not a fabricated Android state.
- `src/components/multicam/CameraTab.tsx`: phase-correct frame pacing (recorded output FPS unchanged).
- `src/lib/mesh.ts`: failed/abandoned remote answer releases the superseded WebRTC connection, not the replacement.
- `src/lib/pointer-gesture-registry.ts` and `EditorPro.tsx`: five gesture modes remove listeners on pointerup, pointercancel, blur, unmount; lost long-press timers are cancelled.
- `src/components/multicam/EditorPro.tsx`: proxies/thumbnails only for timeline-referenced media; cached results reused; regeneration after clearing preview cache.
- `src/lib/video-proxy.ts`: correct 24fps output request on 60/90/120Hz screens.
- `src/lib/clip-persistence.ts`: bounded verification and readback; uncertain storage operations never delete or duplicate original recordings.
- `src/components/multicam/CameraPro.tsx`: keep face tracking and hybrid autofocus, avoid unnecessary duplicate hardware focus requests.
- Test regressions added for emulator loss, proxy pacing, storage timeouts and pointer cancellation.

## Acceptance rules and future work
No test/build pass proves the original WebView heartbeat stall is gone.
Code work remaining on confirmed high-risk areas is real audio streaming analysis,
codec/decoder resource pressure with multilayer preview, and native lock diagnostics.
These must be fixed without reducing output resolution or disabling features.
The separate owner-run emulator/phone acceptance check is not counted as an
unfinished programming task. Do not claim "100% freeze-free" without a reproducible
before/after trace or equivalent runtime evidence.
