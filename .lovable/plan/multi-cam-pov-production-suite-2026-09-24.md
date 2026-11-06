# MULTI-CAM POV production suite

## Product direction
Build a mobile-first, offline dark production interface with three fixed tabs: Camera, Editor, and Settings. The visual language will use pitch-black surfaces, restrained glass panels, crisp SF-style typography, red recording accents, neon-green focus peaking, compact professional controls, and tactile spring motion. The first screen will be the working camera—not a marketing page.

## Foundation and offline state
- Create a typed application store for camera, peer/session, recording, project, timeline, color, audio, export, language, and settings state.
- Persist user settings and project metadata locally; store captured media blobs and generated assets in IndexedDB so the app remains usable offline.
- Add reusable production controls for icon buttons, segmented selectors, sliders, switches, sheets, status pills, and full-screen modals.
- Add motion, ZIP export, and native packaging dependencies; scaffold Capacitor Android configuration without requiring an online service.
- Add complete route metadata and an app-specific document title/description.

## Camera tab
- Initialize the real device camera with `getUserMedia`, camera switching, dual-stream attempts when supported, and a visible interactive simulated feed when unavailable.
- Implement host/join role selection and a local WebRTC-compatible session model. Host recording controls are active; joined peers are locked and react to host-trigger state.
- Show live peer health for three cameras: connection state, battery, storage, and latency; use available device APIs and clearly modeled fallback telemetry where browser access is unavailable.
- Implement reactive overlays and controls: tally frame, focus peaking shader, zebras, WB/ISO locks, three composition grids, level line, shutter angle, anamorphic de-squeeze, lens correction, dual camera, face-tracking box, teleprompter speed/size, markers, and press-and-hold touch lock.
- Record real MediaRecorder clips when a stream exists, stop/finalize them into the local project, and generate usable simulated clips when hardware capture is unavailable.

## Editor tab
- Build a three-angle player with touch/keyboard live-cut controls; switching cameras records cut points into the timeline.
- Build a magnetic multitrack timeline with selectable clips, playhead, markers, ripple delete, trims, L/J cut offsets, split, frame shuttle, crop/aspect, PiP/split-screen modes, speed-ramp nodes, and transform/opacity keyframes.
- Implement local waveform extraction and cross-correlation alignment for captured audio, with an explicit synchronization result shown on the tracks.
- Add 15 LUT presets, `.cube` parsing/upload, canvas preview filters, chroma key controls, 10 transitions, histogram-based auto-match, 10-band EQ, de-esser, noise reduction, loudness normalization controls, and editable generated subtitle blocks.
- Keep controls immediately reflected in the preview and project state; browser-limited effects will use deterministic Canvas/Web Audio processing rather than inert placeholders.

## Export and backup
- Build a full-screen export drawer with format, resolution, FPS, video/audio codec, bitrate, sample-rate, and audio bitrate controls plus the three requested presets.
- Produce downloadable EDL and Premiere/Resolve-compatible XML from current cuts.
- Produce a real ZIP containing project JSON, markers, subtitle data, LUT metadata/custom LUTs, and recorded local assets.
- Provide an offline render workflow with progress and cancellation. Where a requested codec is unavailable in the browser, show capability status and fall back to the closest supported local MediaRecorder format instead of pretending it rendered.

## Settings and localization
- Build grouped iOS-style settings for all 17 languages, network diagnostics, cache/storage management, and hardware render defaults.
- Translate core navigation, recording, editor, export, settings, and privacy strings; switching Arabic sets application-wide RTL layout.
- Make diagnostics interactive: peer latency checks, connection/IP availability, bandwidth sample, storage estimates, cache clearing, and hardware-acceleration state.
- Place Privacy Policy last and open the requested full-screen glass modal with close control and a styled scrollable content area.

## Validation
- Verify camera permission denial and simulation fallback, host/slave locking, recording-to-editor flow, marker creation, timeline edits, LUT upload, subtitle edits, ZIP/XML/EDL downloads, cache clearing, language switching, Arabic RTL, privacy modal, and export capability fallback.
- Check the app at phone and desktop viewport sizes and confirm fixed navigation, overlays, sheets, and timeline controls do not overlap.
- Run focused tests/build checks and inspect the working preview for runtime errors.

## Technical notes
- P2P signaling across unrelated devices requires an external rendezvous/signaling channel, which conflicts with strict zero-service offline operation. The app will implement real local peer/session state and WebRTC-ready signaling payloads; same-device and already-paired local workflows remain offline, while internet-free discovery across separate phones is limited by browser/native platform capabilities.
- Native Android camera parity, simultaneous front/rear capture, unrestricted local-network discovery, and FFmpeg hardware codecs vary by device. The web build will perform capability detection and preserve a functional fallback path; Capacitor packaging provides the base for later native plugins where required.
