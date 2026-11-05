# Freeze audit V2: execution checkpoint
Date: 2026-11-05. Branch: `chatgpt/independent-preview-20261023`, main untouched.

User policy: NEVER remove/disable camera, RAW, stabilization, multi-layer editor,
themes, fold adaptivity, connection controls or audio features; NEVER automatically
delete original recordings. Do not count emulator or phone verification as
unfinished programming work. Freeze root cause is not conclusively identified
without device-side traces.

## V2 findings (F-01 to F-22)

| ID | Status in this pass | Scope and remaining caveat |
|---|---|---|
| F-01 recording phase stale | **Code fix + unit tests** | Recovery marks interrupted (NOT saved) and immediately honors Settings tap. Aborted Activity cannot guarantee full MediaRecorder chunk salvage; user file is never auto-deleted. |
| F-02 high-speed Camera2 synchronous work | **Code fix + tests** | Start, stop, codec/MP4 preflight isolated on dedicated serial worker, not common plugin executor. Emulator HAL can still stall its OWN worker; JS deadline reports unknown. |
| F-03 RAW and stabilization preflight | **Code fix + tests** | CameraCharacteristics queries moved into dedicated executors; sessions preserved and cleanup added. |
| F-04 full-file audio decoder | **Partial mitigation** | Peak extraction time-sliced with same peak density; full `blob.arrayBuffer()` + `decodeAudioData()` still allocates whole file. Requires true streaming-demux design, not silent omission of waveforms. |
| F-05 multiple video decoders | **Earlier partial mitigation** | Timeline-only serial proxies, non-timeline library videos not transcoded; simultaneous visible layers still use independent decoders to preserve actual compositing. |
| F-06 unbounded proxy cache | **Code fix + tests** | Derived-only IndexedDB metadata and 160 MiB / 48-entry LRU; v1 derived proxies regenerated. Original media untouched. |
| F-07 original clips no delete path | **OPEN (policy)** | No automatic deletion allowed. Safe explicit user-confirmed deletion with reference checks is future product work. No lost media due to expiry. |
| F-08 interrupted native MP4 files | **OPEN (policy)** | Recovery/inventory must precede any sweep, never delete last repairable source. |
| F-09 QR role cancellation | **Code fix + regression tests** | Pending offer/answer PCs closed when role switches or modal exits; established channels remain. |
| F-10 synchronous subtitle peak scan | **Code fix + tests** | Batched work and no `Math.max(...veryLargeArray)`; subtitle output remains. |
| F-11 full-resolution night stacking | **Earlier partial mitigation** | Float accumulator replaced with exact integer arrays, halving memory. Heavy pixel loop still on JS; worker migration remains. |
| F-12 filtered capture canvas load | **Earlier partial mitigation** | Phase-locked drawing to requested video FPS; no resolution/codec downgrade. |
| F-13 native JPEG bridge polling | **Code fix + tests** | Adaptive requests after previous response; 250ms on fast hardware, backoff on slow Android. |
| F-14 several audio graphs | **Partial mitigation** | VU meter 25Hz instead of display refresh; audio processing/recording quality unchanged. Shared meter graph design remains. |
| F-15 editor localStorage writes | **Earlier partial mitigation** | Existing 400ms debounce and dirty writes; asynchronous durable project persistence remains. |
| F-16 AudioManager binder work | **Code fix + tests** | Enumerating/selecting audio input moved off plugin callback queue, Bluetooth/USB features unchanged. |
| F-17 missing generated Gradle files | **Not a release blocker in CI** | `cap sync android` generates files; actual GitHub build verifies this. Readme now states the sequence. |
| F-18 malformed keystore pipeline | **Code fix** | `\\vert{}` replaced by shell `|`; `keytool -list` validates permanent keystore without printing it. |
| F-19 inconsistent package managers | **Code fix** | Locked Bun 1.4.4 (actual successful CI version), packageManager + workflow + README. |
| F-20 generated web subtitle fonts parity | **OPEN** | Android script generates offline WOFF2, ordinary web build still uses placeholder; ensure parity without imposing unexpected network dependency or deleting licensed fonts. |
| F-21 source-text tests insufficient | **Partially fixed** | Real React mount/unmount/fake-timer SettingsEntryGate tests added; native device instrumentation not performed. |
| F-22 artifact instructions wrong | **Code/docs fix** | APK/Artifact names aligned with workflow. |

## Extra findings fixed
- Crash-boundary and interrupted recorder phase can leave Settings navigation waiting forever; transition now recovers on same tap rather than forcing a second attempt.
- QR role switch previously ignored a promise without stopping its underlying ICE/SDP session; pending resources now closed.
- Proxy cache was the only store under LRU eviction; original IndexedDB store `multicam-pov-media` not touched.
- Long waveform subtitling used `Math.max(...peaks)` with a potential JS argument-stack overflow; replaced with incremental scan.

## What successful CI proves and does not prove
GitHub Actions `bun run test`, `bunx tsc --noEmit`, `bun run build:android`,
`bunx cap sync android`, Gradle release compilation and artifacts validate a
buildable programming change. They DO NOT prove this build will never freeze on
the user's emulator or physical phones. No claim of 100% freeze elimination is made.
The 2 original camera/fold technical specifications remain paused until the
freeze remediation effort is completed.
