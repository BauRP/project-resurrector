# MULTI-CAM POV (MultiCam Studio) — Complete Architecture & Control Reference

This document describes the codebase as it currently exists. Every statement is derived from the source files listed in Section 6. When a feature is visual-only, simulated, or stored-but-not-applied, this is stated explicitly so the document never overstates what the code does.

---

## 1. Application Overview & Global Purpose

### 1.1 What it is
MULTI-CAM POV ("MultiCam Studio") is an offline-first, phone-first multi-camera recording and editing studio. One phone acts as the **Director (host)**; any number of other phones act as **Cameras (slaves)**. The Director starts and stops recording on every connected camera at the same moment. Each device records locally, stores clips on-device, and the user assembles them in a built-in single-timeline editor, then exports an edit list / project package.

### 1.2 Problem solved & audience
- **Problem:** Shooting a multi-angle video (interview, podcast, event, sport, vlog) normally requires several cameras, a switcher, a network and desktop editing software. Starting recordings on several phones by hand makes them drift out of sync.
- **Solution:** A serverless peer-to-peer link (no internet, no account, no server) that triggers recording on all phones at once, plus on-device capture tools (manual ISO / shutter / white balance, LOG-style profiles, teleprompter, grids) and an on-device editor.
- **Audience:** Solo creators, small crews, podcasters, interviewers, students and event shooters who own several phones and want pro-style control without cloud services. The interface language defaults to Russian and is available in 17 languages.

### 1.3 High-level lifecycle (launch → result)
1. The web app (TanStack Start / React 19) loads — in a browser or inside the Capacitor Android APK.
2. `MulticamApp` mounts the global store; because `capMatrix` is `null`, the **SplashScreen** covers the app and runs `probeDevice()`: real permission prompts, rear-camera probe, front-camera probe, codec/microphone/native capability probe.
3. The resulting **Capability Matrix** is written to the store and to localStorage; the splash disappears and the **Camera** tab is shown.
4. The user optionally connects devices via **Connect** (numeric ID for same-device tabs, or QR codes for separate phones over WebRTC).
5. The Director presses **Record**; a `record` message is broadcast; every Camera's recorder starts. Pressing again stops them all. Each device saves its clip to IndexedDB.
6. In the **Editor** tab clips appear in the Media Library; the user places them on the timeline, cuts, deletes, adds transitions, color-corrects, adds text / subtitle placeholders, previews playback.
7. **Export** produces downloadable files: a render manifest JSON, an EDL, an XML and a ZIP project backup.

---

## 2. Complete Application Workflow (0 → 100 %)

### 2.1 Boot & routing
- `src/routes/__root.tsx` renders the HTML shell (`RootShell`) with `<HeadContent/>`, the stylesheet, viewport meta `width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover`, and wraps every route in `QueryClientProvider`. It defines a 404 page (`NotFoundComponent`, "Go home" link) and an error page (`ErrorComponent`, "Try again" → `router.invalidate()` + `reset()`, "Go home" → `/`), reporting errors via `reportLovableError`.
- `src/routes/index.tsx` is the only content route (`/`) with its own `head()` (title "MULTI-CAM POV — Offline Multicam Production") and renders `<MulticamApp/>`.
- `src/router.tsx` creates the router with a `QueryClient` in context and scroll restoration.

### 2.2 Store hydration
`MulticamStoreProvider` starts from `defaults`, then in an effect reads localStorage key **`multicam-pov-state-native`** and merges it. Any later change of the persisted fields writes them back (see 4.2). Failures (restricted WebView) are swallowed silently; state then lives only in memory.

### 2.3 Startup capability probe (SplashScreen)
`SplashScreen` calls `probeDevice(onStage)` once; stage text and a spring-animated progress bar update in real time. The duration equals the real execution time — no artificial delay.

| Stage index | Text shown | Progress | Work performed |
|---|---|---|---|
| 0 | «Запрос разрешений...» | 5 % | `getUserMedia({video, audio})`; on failure tries video-only and audio-only separately. `navigator.storage.persist()` + `estimate()`. Results in `permissions.camera/microphone/storage` (`granted`, `denied`, `granted-temporary`, `prompt`, `unavailable`). |
| 1 | «Проверяю основную камеру...» | 30 % | `probeCamera("environment")` (exact facing; falls back to any camera). Reads `track.getCapabilities()`: max width/height/fps, supported resolutions among 720p/1080p/4K, fps among 24/30/60, ranges for `iso`, `exposureTime`, `focusDistance`, `colorTemperature`, `zoom`, manual WB support, torch. Stream is stopped immediately. |
| 2 | «Проверяю фронтальную камеру...» | 60 % | `probeCamera("user")` (no fallback). If its `deviceId` equals the rear one, front is marked unavailable. |
| 3 | «Проверяю все функции, кодеки и системные возможности...» | 80 → 100 % | `enumerateDevices()` (microphone count); `MediaRecorder.isTypeSupported` for VP8/VP9/AV1/H.264; if native, `MultiCamNative.getCapabilities()` merges Camera2 high-speed fps lists and ISO ranges. |

The matrix is saved to localStorage **`multicam-capability-matrix`** and passed to `onDone` → `set({ capMatrix })`. `ready` (`capMatrix !== null`) becomes true and the splash unmounts. If permissions are denied the probe still completes; cameras are marked unavailable and the Camera tab shows the simulated feed.

### 2.4 Camera tab steady state
- Opens a `getUserMedia` stream for the current facing (`environment`/`user`) and selected microphone. Success → `cameraState = "live"` and `<video>` shows the feed; failure → `"simulated"` and an animated gradient "simulated feed" with a horizon line is shown.
- Every 5 s `mesh.sendTelemetry()` gathers this device's battery % and free storage MB (shown in the HUD battery chip and sent to peers).
- Leaving the Camera tab resets `cleanFrame` to `false`.

### 2.5 Connecting devices
See 3.3. Two transports:
- **By ID** — `BroadcastChannel("multicam-pov-<id>")`. Links windows/tabs of the same browser on the same device only.
- **By QR** — WebRTC data channel with no STUN/TURN (`iceServers: []`), so devices must be on the same local network. Signaling is manual: offer QR → answer QR. One offer per additional camera, unlimited count.

### 2.6 Recording
1. Director/solo presses Record → `toggleRecording()` flips `recording`, sets `recordingStartedAt = Date.now()` (or `null` on stop), resets `paused`. Ignored when `role === "slave"`.
2. `useMeshBridge` (in MulticamApp): when `role === "host"`, every change of `recording` broadcasts `{type:"record", on, at}`. On slaves, an incoming `record` message sets `recording`/`recordingStartedAt` locally.
3. CameraTab's recorder effect reacts to `recording` on every device:
   - Chooses source: raw stream, or a **canvas pipe** when the tone profile is not `standard` or mode is time-lapse (1 frame / 1000 ms) or hyperlapse (1 frame / 200 ms). The canvas applies `toneFilter(profile)` via `ctx.filter`. Lapse modes drop audio.
   - MIME: chosen codec (`codecMime`) if supported, else `video/webm;codecs=vp9,opus`, else `video/webm`.
   - `MediaRecorder.start(1000)` collects 1-second chunks.
   - On stop: blob is written to IndexedDB database **`multicam-pov-media`**, store **`clips`**, record `{id:"clip-<ts>", createdAt, camera: activeCamera, mode, profile, playbackRate, blob}`; then `window` event **`multicam-clips-changed`** is dispatched.
4. Pause/Resume toggles `paused` → `recorder.pause()` / `resume()` (same file).
5. Slow-mo 120/240 modes are selectable only when the capability matrix reports high-speed support; the browser recorder itself records at the stream's frame rate. Native `startHighSpeedRecording` / `stopHighSpeedRecording` exist in the plugin bridge but are not called by the UI.

### 2.7 Editing
`EditorPro` loads every clip from IndexedDB (`readClips`), sorts by `createdAt`, analyses each (`analyse`: object URL, duration via a hidden `<video>`, waveform peaks via `OfflineAudioContext.decodeAudioData`, 20 peaks per second). It reloads on `multicam-clips-changed`. Clips are **not** placed automatically: the user taps them in the Media Library. Timeline state is local and not persisted — leaving the Editor tab clears the timeline (clips stay in storage).

### 2.8 Export
Header **Export** opens the Export drawer. "Render offline" runs a progress bar (≈ +9 % every 160 ms) and then downloads `multicam-render-manifest.json` containing the export config — it does not encode a video file. EDL / XML / ZIP buttons download project metadata (see 3.5).

### 2.9 State handling summary
| Situation | Behaviour |
|---|---|
| Loading | Splash screen with stage text; Editor shows «Загрузка клипов…» in the preview while analysing. |
| Camera denied / absent | Simulated feed, "SIM" chip, switch-camera button disabled if the other camera is unavailable. |
| Unsupported setting | Chip greyed (opacity 35 %) with «· Не поддерживается»; tapping shows a 3.5 s warning banner. |
| Constraint rejected by hardware | `applyConstraints` failure → warning banner «Этот режим: не поддерживается …». |
| QR decode / wrong code | «scanError» text in red; phase returns to show/idle. |
| QR scanner camera blocked | «cameraBlocked» warning box instead of the viewfinder. |
| Import of non-media file | «Поддерживаются только видео и аудио файлы». |
| IndexedDB write failure on import | «Не удалось сохранить файл в хранилище». |
| Invalid transition drop | «Отпустите переход на стыке двух видеоклипов» / «Отпустите переход точно между двумя соседними видеоклипами». |
| Peer silent > 12 s | Removed from peer list automatically. |
| Runtime error | Root ErrorComponent with "Try again" / "Go home". |
| Unknown URL | Root 404 page. |

---

## 3. Micro-Level UI/UX & Component Dictionary

Notation: **State** = `useMulticamStore` global field; **local** = component `useState`.

### 3.1 App shell (`MulticamApp.tsx`)
Layout: `.app-stage` (black, full-screen, centring) → `.app-shell` (9:16, `100dvh` high, width `min(100vw, 100dvh·9/16)`) → `.app-scroll` (scrolls; on the Camera tab becomes a non-scrolling flex column).

| Element | Location | Trigger | Function | Effect |
|---|---|---|---|---|
| App title "MULTI-CAM POV" | Header left | — | — | Static label. |
| **Export** pill (download icon) | Header right; visible only on Editor tab | tap | `set({ exportOpen: true })` | Opens Export drawer (3.5.5). |
| **Connect** pill (link icon) | Header right | tap | local `setConnectOpen(true)` | Opens ConnectModal. Label: "Connect" when solo; otherwise "`<ROLE>` · `<peer count>`" plus a dot (green when ≥ 1 peer, amber when 0). |
| Bottom nav: **Camera** | Bottom floating bar, slot 1 | tap | `setTab("camera")` | Switches tab; animated active indicator (`layoutId="nav-active"`). |
| Bottom nav: **Editor** | slot 2 | tap | `setTab("editor")` | Same. |
| Bottom nav: **Settings** | slot 3 | tap | `setTab("settings")` | Same. |
| Header + bottom nav | — | `cleanFrame && tab==="camera"` | — | Both hidden in Clean Frame mode. |
| Tab transition | Content | tab change | framer-motion `AnimatePresence mode="wait"` | 180 ms fade/slide. |
| Document direction | `<html>` | language change | effect | `dir="rtl"` for Arabic, else `ltr`; `lang` = language code. |

Nav labels come from a per-language table (kk, pt, es, fr, ar, zh, ko, ja, de, it, tr, pl, hi, vi, id) or `t("camera"|"editor"|"settings")` for en/ru.

### 3.2 Splash screen (`SplashScreen.tsx`)
No interactive controls. Shows title, progress bar (`motion.div` width = progress %), and the live stage text (`aria-live="polite"`). Covers the shell at `z-[100]` until the matrix is ready.

### 3.3 Connect modal (`ConnectModal.tsx`)
Full-screen dimmed overlay (`z-[60]`); tapping the backdrop closes it; tapping the panel does not.

#### 3.3.1 Header row
| Control | Visible | Effect |
|---|---|---|
| **Back** (chevron) | Steps "id" / "qr" | local `setStep("choose")`. |
| Title | Always | «How would you like to connect?» / «By custom number (ID)» / «By QR code». |
| **Close** (X) | Always | `onClose()` → modal unmounts. |

#### 3.3.2 Step "choose"
| Control | Effect |
|---|---|
| **By custom number (ID)** card (# icon) | `setStep("id")`. |
| **By QR code** card (QR icon) | `setStep("qr")`. |
| Peers box | Shown when `role !== "solo"`: "Peers · N", each peer's name and latency (ms) or «No peers». |
| **Leave session** | `mesh.leave()` (sends `bye`, closes BroadcastChannel, data channels and pending connection, clears peers) then `set({ role: "solo", sessionCode: "POV-842" })`. |

#### 3.3.3 Role switch (shared by ID and QR flows)
Segmented control: **I am the director** / **I am a camera** → local `host` boolean. In the QR flow switching also resets `phase` to `idle` and clears the QR image.

#### 3.3.4 ID flow
| Control | Role | Trigger | Effect |
|---|---|---|---|
| **Create session** | Director | tap | Random 6-digit ID; `mesh.joinLocal(id)`; `set({ role:"host", sessionCode:id })`. Replaced by the big Session ID display and "Connected: N" / "Waiting…". |
| Session ID input | Camera | typing | Non-digits stripped; numeric keyboard. |
| **Join** | Camera | tap (disabled if < 3 digits) | Validates `^\d{3,12}$`; `mesh.joinLocal(value)`; `set({ role:"slave", sessionCode:value })`. Status line then shows "Connected · ID" or "Waiting…". |
| Note text | Both | — | Explains ID pairing is same-device only; use QR for separate phones. |

#### 3.3.5 QR flow (WebRTC)
Local state: `phase` = `idle | busy | show | scan | done`, `qr` (data URL), `code`, `addresses`, `error`, `paste`.

| Control | Phase / role | Effect |
|---|---|---|
| **Create session** (QR icon) | idle, Director | `makeOffer()`: keeps current session code if already host, else new `POV-xxx`; `set({role:"host", sessionCode})`; `mesh.createOffer()` (new RTCPeerConnection, data channel "pov", waits ≤ 2.5 s for ICE); renders offer as QR (`qrcode`, error level L, 480 px); phase → show. |
| Scanner | idle, Camera | Opens rear camera, decodes frames with `jsQR` every animation frame; first hit calls `handleCode` → `mesh.answerOffer()`; sets `role:"slave"` and the director's session code; shows answer QR. |
| QR image + "Address: ip:port …" | show | Displays up to 3 ICE candidate addresses parsed from the SDP. |
| **"<N> B · copy"** link | show | Copies the raw code to the clipboard (for paste-based pairing). |
| **Scan reply** | show, Director | phase → scan (opens Scanner for the camera's answer). |
| "Waiting…" | show, Camera | Turns into done automatically once a peer appears. |
| Scanner (step 2) | scan, Director | Decoded answer → `mesh.acceptAnswer()`; phase → done. |
| Paste field + **Apply** | idle or scan | Manual code entry; Apply (disabled when empty) runs `handleCode(paste)`. |
| "Connected · N devices" | done | Success message. |
| **Add camera** | done, Director | Runs `makeOffer()` again for one more camera. |
| Error text | any | «scanError» when the code is not an offer/answer or decoding fails. |

### 3.4 Camera tab (`CameraTab.tsx`)
Fixed full-height screen, no page scroll. Layers top-to-bottom: viewfinder, overlays, HUD bar, HUD micro-slider panel, peer cards, settings sheet, bottom dock, ProTip popover.

#### 3.4.1 Viewfinder & overlays
| Element | Condition | Behaviour |
|---|---|---|
| Live `<video>` | `cameraState==="live"` | `object-cover`; horizontal stretch `scale-x-[1.33]`/`[1.55]` for anamorphic; CSS filter = tone profile preview + `contrast(1 + distortion/300)` + `saturate(1.18)` when `selectedLut !== "Neutral"` + white-balance tint (sepia below 5600 K, hue-rotate above). |
| Simulated feed | otherwise | Animated gradient with horizon line. |
| Tally frame | recording and not Clean Frame | Pulsing red frame (`.tally-frame`). |
| Dual-camera PiP | `dualCamera` | Small 3:4 window top-right showing the simulated feed (visual only). |
| Focus peaking | `focusPeaking` | Decorative striped screen-blend overlay (does not analyse the image). |
| Zebras | `zebras` | Diagonal stripe overlay at 30 % (decorative, not exposure-based). |
| Grid | `grid !== "off"` | `grid-thirds` / `grid-cross` / `grid-golden` / `grid-level` overlay. |
| Tracking box "FACE 01" | `tracking` | Animated looping rectangle (visual guide; no face detection). |
| Teleprompter | `teleprompter` and non-empty text | Masked text scrolling upward; font size `teleprompterSize` px; loop duration `max(4, 60 − teleprompterSpeed)` s. |
All overlays are hidden in Clean Frame mode.

#### 3.4.2 HUD status bar (top, horizontal scroll)
| Control | Trigger | Function | Effect |
|---|---|---|---|
| LIVE/SIM chip | — | — | Green dot + "LIVE" or amber dot + "SIM". |
| **Shutter chip** ("1/48s") | tap | `toggleHud("shutter")` | Opens/closes the shutter micro-slider. |
| **ISO chip** ("ISO A" / value) | tap | `toggleHud("iso")` | Opens ISO slider; dimmed if camera lacks ISO range. |
| **WB chip** ("WB A" / "5600K") | tap | `toggleHud("wb")` | Opens white-balance slider. |
| **Grid chip** ("#Трети") | tap | `toggleHud("grid")` | Opens grid chooser. |
| Battery chip | — | — | This device battery % from telemetry or "–". |
| **Clean Frame** (eye / eye-off) | tap | `setHud(null); setSheet(false); set({cleanFrame:!clean})` | Hides everything except feed, record button and this icon (shown at 60 % opacity). Tap again to restore. |
| Help "?" next to Clean Frame | tap | HelpDot `cleanFrame` | Help modal. |

#### 3.4.3 HUD micro-slider panel (appears below the bar)
| Panel | Control | Range | Effect |
|---|---|---|---|
| Shutter | Label (long-press 500 ms → ProTip "shutter"), "?" help, slider | index 0–5 over 1/24, 1/48, 1/60, 1/120, 1/250, 1/500 | `set({shutter})`; effect pushes `exposureMode:"manual", exposureTime = (n/d)·10000` to the track if supported. |
| ISO | Unsupported message «ISO · Не поддерживается» when capability is missing; otherwise slider | 50–3200 step 50 | `set({capture.iso, isoLock:true})`; effect pushes `iso` with manual exposure. |
| ISO | **Авто** button | — | `capture.iso = null`, `isoLock = false`. |
| WB | Unsupported note «Баланс белого · Не поддерживается (только предпросмотр)» if no WB support (slider still shown, preview tint only) | 2500–8000 K step 100 | `set({wbKelvin, wbLock:true})`; pushes `whiteBalanceMode:"manual", colorTemperature`. |
| WB | **Авто** | — | `wbKelvin = null`, `wbLock = false`; pushes `whiteBalanceMode:"continuous"`. |
| Grid | Buttons Выкл / Трети / Крест / Золотое / Уровень + "?" | — | `set({grid: "off"|"thirds"|"cross"|"golden"|"level"})`. |

#### 3.4.4 Peer camera cards
Visible only when ≥ 1 peer is connected (above the dock). One card per peer: "CAM n · name", red dot when recording / green when idle, battery %, free MB, latency ms. **Tap** → `set({ activeCamera: n })` (ring highlight). `activeCamera` is stored in new clips' `camera` field and determines their default timeline lane.

#### 3.4.5 Bottom dock
| Control | Position | Trigger | Function | Effect |
|---|---|---|---|---|
| Timer | Above buttons | — | `formatTime(elapsed)` | `MM:SS.d`, updated every 100 ms; red while recording. |
| Status line | Under timer | — | — | «Controlled by Host» (slave) / «Пауза» / «Recording» / "`ROLE` · `sessionCode`". |
| **Switch camera** | Left | tap | `set({facing: rear↔front, capture.iso/focus/exposure=null, wbKelvin=null})` | Restarts stream with the other camera; disabled when the matrix says the other camera is unavailable. |
| **Parameters** (sliders icon) | Left | tap | `setHud(null); setSheet(!sheet)` | Opens/closes the settings sheet; highlighted while open. |
| **Record** (big circle) | Centre | tap | `toggleRecording()` | Start/stop (2.6). For slaves: disabled, shows a padlock. Scale-down tap animation. |
| **Pause / Resume** | Right | tap (enabled only while recording) | `set({paused:!paused})` | Pauses/resumes MediaRecorder. |
| **Add marker** | Right | tap | `addMarker()` | Appends `{id, time, label:"Marker N"}`; time = seconds since recording start, or `playhead` when not recording. Markers are persisted. |

#### 3.4.6 Settings sheet (scrolling panel with accordions)
Each accordion header (`Accordion`) is a button toggling local `open` with a rotating chevron and an optional "?" HelpDot.

**A. Инструменты кадра (Frame tools)** — open by default. Hint text "Hold any pro control for help".
| Control | Short tap | Long press (500 ms, vibrates 15 ms) | Help |
|---|---|---|---|
| **Peak** | toggle `focusPeaking` | ProTip "focusPeaking" | `peak` |
| **Zebra** | toggle `zebras` | ProTip "zebras" | `zebra` |
| **WB** (lock) | toggle `wbLock` | ProTip "wbLock" | `wb` |
| **ISO** (lock) | toggle `isoLock` | ProTip "isoLock" | `iso` |
| **Track** | toggle `tracking` | — | `track` |
| **Dual** | toggle `dualCamera` | — | `dual` |

**B. Объектив (Lens)**
| Control | Effect |
|---|---|
| Anamorphic label (long-press → ProTip) + "?" | Help / tip. |
| **Выкл / 1.33x / 1.55x** | `set({anamorphic})` → preview horizontal stretch. |
| Lens correction slider (label long-press → ProTip "distortion") | −50…50 → `distortion` → preview contrast adjustment. |
| **Hold screen lock** button | Pointer down → `touchLocked:true`; pointer up/leave → `false`. Highlighted while held. "?" help `holdLock`. |

**C. Teleprompter** (`TeleprompterControls`, also reused in Editor)
| Control | Effect |
|---|---|
| Teleprompter switch | `teleprompter` on/off. |
| Text textarea («Текст для суфлёра») | `teleprompterText` (persisted). |
| Scroll speed slider 10–55 | `teleprompterSpeed` (persisted). |
| Font size slider 14–48 | `teleprompterSize` (persisted). |

**D. Профессиональная съёмка (Pro capture)** → `CaptureProPanel` (3.4.7).

#### 3.4.7 Capture Pro panel (`CaptureProPanel.tsx`)
On mount / stream change: reads track capabilities, merges native high-speed fps, lists microphones, starts an `AudioContext` analyser for meters, polls dropped frames and native thermal status every 2 s.

Each option chip: active = filled primary; supported = normal; unsupported = 35 % opacity with «· Не поддерживается». Tapping an unsupported chip shows the warning «<name>: не поддерживается основной/фронтальной камерой — выбор заблокирован…» for 3.5 s.

| Row | Options | Support rule | Effect on tap |
|---|---|---|---|
| Разрешение | 720p, 1080p, 4K | In matrix and within track max size | `applyTrack({resolution})` → `applyConstraints` width/height ideal. |
| Кадры/с | 24, 30, 60 | In matrix and ≤ track max fps | `applyTrack({fps})` → frameRate ideal. |
| Кодек | VP8, VP9, AV1, H.264 | In matrix codecs and `MediaRecorder.isTypeSupported` | `capture.codec` (used by next recording). |
| Режим | Обычный, Slow‑mo 120, Slow‑mo 240, Time‑lapse, Hyperlapse | Slow-mo needs high-speed list or max fps ≥ 120/240; all blocked while recording | `capture.mode`. |
| Профиль | Стандарт, LOG, FLAT, Direct Log | Always | `capture.profile`; preview filter and canvas-pipe recording filter. |
| ISO (manual) | slider within capability range | Range from matrix/track, else «Не поддерживается» | Value button toggles **Авто** ↔ min value; slider disabled in Auto; `applyTrack({iso})`. |
| Выдержка (экспозиция) | slider | same | `applyTrack({exposure})` → `exposureTime`. |
| Фокус | slider, step 0.01 | same | `applyTrack({focus})` → `focusMode:"manual", focusDistance`. |
| Микрофон | dropdown «По умолчанию» + detected inputs | — | `capture.micId` → stream restarts with that device; on native also `setPreferredAudioInput`. |
| VU / PPM meters | — | needs audio track | RMS (green bar) and decaying peak (red marker), −60…0 dB scale, ~16 Hz refresh. |
| Dropped frames | — | `getVideoPlaybackQuality` | Count, amber when > 0. |
| Thermal | — | native only | «Норма / Слабый нагрев / … / Отключение · °C»; browser shows «Недоступно в браузере». |

#### 3.4.8 ProTip popover & long-press (`ProTip.tsx`)
`useLongPress(onLong, onTap)` — pointer-down starts a 500 ms timer; firing vibrates and calls `onLong`; release before that calls `onTap`. Context menu suppressed. `ProTipPopover` shows title/body from `tip(key)` (i18n); tapping outside or **Close (X)** closes it. Keys: focusPeaking, zebras, wbLock, isoLock, shutter, anamorphic, distortion.

#### 3.4.9 Help system (`Help.tsx`)
`HelpDot id` renders a "?" button next to sections and parameters (only if `HELP[id]` exists). Tap → portal modal (`z-[200]`) with Russian title and explanation; close via X or backdrop. Pointer-down propagation is stopped so it never toggles the parent control. The `HELP` dictionary covers: frameTools, peak, zebra, wb, iso, track, dual, lens, anamorphic, distortion, holdLock, teleprompter, promptText, promptSpeed, promptSize, pro, resolution, fps, codec, mode, profile, manualIso, exposure, focus, mic, meters, shutter, wbKelvin, grid, cleanFrame, switchCam, timeline, cut, delete, add, loop, color, audio, export, inspector, language, network, cache, hwaccel, deEsser, autoGain, chromaTol, chromaSmooth, transitions, and the 13 color keys (cTemperature … cGamma).

### 3.5 Editor tab (`EditorTab.tsx` + `EditorPro.tsx`)

#### 3.5.1 Preview monitor
| Element | Trigger | Effect |
|---|---|---|
| Preview area (16:9) | tap | `setEditing(null)` (closes text editor). |
| Active clip video | — | Topmost-priority (lowest track number) un-muted video clip under the playhead; seeks when drift > 0.04 s; reverse plays `out − local`. Style: SVG color-correction filter + Look filter + transition filter; opacity; `translateX(posX%) scale(scale%)`. Muted unless an audio source is active. |
| Empty state | — | «Загрузка клипов…» while loading, else "00:00.00". |
| Overlays (text / subtitles) | press-drag | Moves overlay (x/y clamped 2–98 %). Tap without moving opens the text editor. |
| Timecode badge | — | `MM:SS.ss` of the playhead. |
| **Pin monitor** (pin icon, top-right) | tap | Toggles `pinMon`: monitor becomes sticky under the app header while scrolling. |

#### 3.5.2 Transport bar
| Button | Effect |
|---|---|
| **Повтор (Loop)** | Toggle `loop`; at the end playback jumps back to the first clip start. |
| **В начало** | Stop and set playhead to first clip start. |
| **Кадр назад** | Playhead − 1/30 s (not before first clip). |
| **Play / Pause** | Toggle `playing`; if playhead is at end or before first clip it restarts from the first clip. Playback advances via `requestAnimationFrame`. |
| **Кадр вперёд** | Playhead + 1/30 s (not past end). |
| **Уменьшить масштаб** | `zoom / 1.5` (min 8 px/s). |
| **Увеличить масштаб** | `zoom × 1.5` (max 600 px/s). |

#### 3.5.3 Timeline
- Width = `56 + total·zoom + 40` px; total = max(10 s, last clip end). Horizontally scrollable.
- **Pin timeline** button (top-left): toggles `pinTl` — sticky under header (and under the monitor if pinned).
- **Ruler**: tap/press → playhead moves to that time. Second ticks (every 5 s when zoom < 20).
- **Lanes**: `vTracks` video lanes (CAM 1…n) then `aTracks` audio lanes (A1…n), each 44 px high.
- **Lane mute button** (camera / speaker icon): toggles `muted[laneKey]`; muted video lanes are skipped for preview, muted audio lanes silence playback; clips dim to 40 %.
- **Clip block**: shows waveform from peaks (reversed when reverse is on), "N×" speed label and "⟲" reverse mark.
  - Tap → select (`selected`), opens Inspector.
  - Hold 450 ms without moving → select with 30 ms vibration.
  - Drag (> 6 px) → move horizontally (start ≥ 0) and vertically between lanes of the same kind (snaps per 44 px).
- **Transition diamond** on a cut point: tap → selects that transition (`selTr`).
- Tapping empty timeline → clears clip and transition selection.
- **Red playhead line** at the current time.
- Caption under timeline: "Таймлайн · N видео · M аудио" + help.
- **Keyboard**: Delete / Backspace (outside inputs) deletes the selected transition or ripple-deletes the selected clip.

#### 3.5.4 Tool buttons
| Button | Enabled | Effect |
|---|---|---|
| **Разрезать** | always | Splits the selected clip (or every clip if none selected) under the playhead into two clips at that point. |
| **Удалить** | clip or transition selected | Removes selected transition; otherwise ripple-delete: removes the clip and shifts later clips on the same lane left by its length. |
| **Добавить ▾** | always | Toggles the Add menu. |
| ↳ **Добавить** (file) | menu | Opens file picker (`video/*,audio/*`); file saved to IndexedDB as `import-<ts>` with kind and name; added to the selected clip's lane if same kind, else lane 1. |
| ↳ **Добавить видео дорожку** | menu | `vTracks + 1`. |
| ↳ **Добавить аудио дорожку** | menu | `aTracks + 1`. |
| **Отделить звук** | selected clip is video | Creates an audio copy of the clip on the first free audio lane (creating a new lane if needed); ignored if already detached. |
| **Создать офлайн‑субтитры / Анализ звука… / Скрыть субтитры** | there are clips | Off → detects loud segments (≥ 25 % of max peak, ≥ 0.4 s) and creates subtitle overlay blocks with placeholder text «Реплика N» at the bottom; On → removes all subtitle overlays. No speech recognition is performed. |
| **Текст** | always | Adds a text overlay «Ваш текст» lasting 4 s from the playhead and opens its editor. |
| **Телесуфлёр** | always | Toggles inline TeleprompterControls (same global teleprompter state as the Camera tab). |
| Media Library chips | when media exist | Tap → appends the clip at the end of its lane (lane = clip camera number, clamped to existing lanes). Label: name or "CAM n · #k" / "An · #k" and duration. |
| Error line | — | Import errors. |

#### 3.5.5 Inspector (selected clip)
| Control | Effect |
|---|---|
| Title "Инспектор · CAM n / An" + help | — |
| **Снять выделение (X)** | Deselect. |
| Speed buttons **0.25× 0.5× 1× 1.5× 2× 4×** | `speed` → clip length on timeline = (out − in) / speed; preview playback position scales. |
| **⟲ Реверс** | Toggle `reverse`. |
| Look dropdown | Без цвета, Тёплый, Холодный, Ч/Б, Кино, Яркий, LOG → Rec709 (CSS filters). |
| Масштаб slider 50–200 | `scale`. |
| Позиция X slider −50…50 | `posX`. |
| Прозрачность slider 0–100 | `opacity`. |

#### 3.5.6 Text / subtitle editor (floating panel)
| Control | Effect |
|---|---|
| Title «Текст» or «Стиль субтитров»; **Закрыть (X)** | Close. |
| Text input | Edits only this overlay's text. |
| 4 **Aa** font buttons (system-ui, Georgia, monospace, Impact) | Font; for subtitles applied to all subtitle blocks. |
| Color picker | Text color (all subtitles when editing a subtitle). |
| **Подложка** checkbox | Semi-transparent black background. |
| Size slider 10–48 | Font size. |
| **Удалить** | Removes this overlay. |

#### 3.5.7 Accordions under the editor
**Переходы (Transitions)**
- Category buttons: **Базовые** (Растворение, Затемнение, Вспышка), **Движение** (Сдвиг, Шторка, Зум), **Эффекты** (Размытие, Глитч, Вращение).
- Transition tiles: press and drag; a floating label follows the finger; drop on a video lane at the join of two adjacent clips (gap < 0.15 s, within max(1 s, 30 px) of the join). Duration = min(1 s, both clip lengths). Replaces an existing transition on the same pair and selects the new one. Invalid drops show a warning.
- Preview effect computed live: dissolve, fade, flash (brightness), slide, wipe (clip-path), zoom, blur, glitch, spin.

**Цвет (Color)** — requires a selected video clip (otherwise hint text).
- 13 sliders −100…100 each with help: Температура, Оттенок, Вибрация, Насыщение, Воздействие, Яркость, Контрастность, Светлые участки, Тень, Белый, Черный, Тон, Гамма. Rendered through an SVG filter (`feColorMatrix` RGB gain, saturate, hueRotate + `feComponentTransfer` tone-curve table).
- **Сбросить цвет клипа** → all values 0.
- **Chroma panel** (from EditorTab): Chroma color picker → `chromaColor`; switch → `chromaEnabled`; Tolerance 0–100 → `chromaTolerance`; Smoothness 0–100 → `chromaSmoothness`. These values are stored in global state; the preview does not currently key out the color.

**Звук (Audio)** (from EditorTab)
- 10-band EQ vertical sliders (31 Hz … 16 kHz), −12…+12 dB → `setEqBand(i, v)`.
- **De-esser** switch → `deEsser`; **Auto gain −14 LUFS** switch → `autoGain`; **Noise** slider 0–100 → `noiseReduction`.
- These values are stored in global state; no audio processing graph applies them to playback.

#### 3.5.8 Export drawer (`ExportDrawer` in EditorTab)
Slides in from the right, full-screen.
| Control | Effect |
|---|---|
| **Close (X)** | `exportOpen = false`. |
| **4K Cinema** | Preset: 21:9, 4K, 24 fps, H.265/HEVC, 80 Mbps, FLAC, 96 kHz, 320 kbps. |
| **Reels 60** | 9:16, 1080p, 60 fps, H.264, 20 Mbps, AAC, 48 kHz, 256 kbps. |
| **Fast Draft** | 16:9, 720p, 30 fps, H.264, 5 Mbps, AAC, 44.1 kHz, 128 kbps. |
| Aspect dropdown | 16:9, 9:16, 1:1, 21:9. |
| Resolution | 360p, 720p, 1080p, 2K, 4K. |
| FPS | 24, 25, 30, 48, 50, 60. |
| Video codec | H.264, H.265/HEVC, VP9, AV1. |
| Audio codec | AAC, MP3, Opus, FLAC, WAV. |
| Sample rate | 22.05, 44.1, 48, 96 kHz. |
| Bitrate slider | 1.5–120 Mbps step 0.5. |
| Audio bitrate slider | 64–320 kbps. |
| Progress bar | Visible when `exportProgress > 0`. |
| **Render offline** | Simulated progress to 100 %, then downloads `multicam-render-manifest.json` (status, fallback MIME, config). |
| **EDL** | Downloads `multicam.edl` — one line per store `cut`: `n AX V C <time> CAM<n>`. |
| **XML** | Downloads `multicam.xml` — `<project><cut time camera/>…</project>`. |
| **ZIP** | `downloadProjectZip` → `multicam-pov-YYYY-MM-DD.zip` with `project.json` (markers, cuts, subtitles, LUT, export config) and `README.txt`. |
The export config is persisted. Note: store `cuts` are created only by `switchCamera()`, which no UI currently calls, so EDL/XML are empty unless cuts were restored from storage.

### 3.6 Settings tab (`SettingsTab.tsx`)
Page title and section headings are localized via its own copy table (17 languages; English fallback).

| Section | Control | Effect |
|---|---|---|
| Language (+ help) | Dropdown: English, Русский, Қазақ тілі, Português, Español, Français, العربية, 中文, 한국어, 日本語, Deutsch, Italiano, Türkçe, Polski, हिन्दी, Tiếng Việt, Bahasa Indonesia | `set({language})` (persisted); RTL for Arabic. |
| Mesh diagnostics (+ help) | Stats grid | LATENCY (ms), STATUS (LOCAL / OFFLINE from `navigator.onLine`), BANDWIDTH (Mb/s). |
| | Mesh nodes line | "Mesh nodes · peers+1 · `mesh.localId` or `sessionCode`". |
| | **Run test / Testing…** | `diagnose()`: gzip-compresses a 4 MB buffer to benchmark local throughput (`32 / seconds` → "Mb/s"), averages peer latencies, stores in `diagnostics`. It does not measure network transfer. |
| Storage & cache (+ help) | Offline cache line | Shows `cacheMB` (from `navigator.storage.estimate().usage` on mount) · IndexedDB. |
| | **Clear cache** | `indexedDB.deleteDatabase("multicam-pov-media")` (all clips deleted) and `cacheMB = 0`. No confirmation. |
| Render engine (+ help) | **Hardware acceleration** switch | `hardwareAcceleration` (persisted flag; not read by any renderer). |
| | **Reset project** row | `resetProject()`: markers, cuts, subtitles, playhead, duration=62, activeCamera=1, playing=false, recording=false, exportProgress=0. |
| (no title) | **Privacy Policy** row | Opens full-screen privacy overlay. |
| Privacy overlay | **Close (X)** | Closes. Body is currently an empty dashed placeholder box (no policy text yet). |

---

## 4. Core Architecture, Tech Stack & Data Flow

### 4.1 Tech stack
| Layer | Technology |
|---|---|
| Framework | TanStack Start v1 (React 19, SSR-capable), TanStack Router file routes, Vite 7 |
| Data/query | @tanstack/react-query (root provider; app state uses its own context store) |
| Styling | Tailwind CSS v4 via `src/styles.css` (oklch tokens, `@utility glass-panel`, custom classes `.app-stage`, `.app-shell`, `.bottom-nav`, `.app-header`, `.hud-chip`, `.record-shutter`, `.simulated-feed`, `.tally-frame`, `.focus-peaking`, `.zebra-overlay`, `.grid-*`, `.teleprompter-mask`, `.segmented`, `.vertical-slider`, `.connect-pill`, `.settings-item`, `.setting-row`, `.camera-frame`, `.scrollbar-none`); global `touch-action: manipulation`, `user-select: none` (text inputs re-enabled) and safe-area insets |
| UI kit | shadcn/ui on Radix (Button, Slider, Switch used), lucide-react icons, framer-motion animations |
| P2P | WebRTC `RTCPeerConnection` data channels, `BroadcastChannel` |
| QR | `qrcode` (generate), `jsqr` (decode) |
| Storage | localStorage, IndexedDB, Storage API |
| Media | `getUserMedia`, `MediaRecorder`, Canvas `captureStream`, Web Audio (`AudioContext`, `OfflineAudioContext`), SVG filters |
| Files | `jszip`, Blob downloads |
| Native | Capacitor 8 (`@capacitor/core`, `@capacitor/android`), custom Java plugin |
| Ads | None — the app contains no ad SDKs or ad UI |

### 4.2 Global state (`src/lib/multicam-store.tsx`)
React Context store, kept as a single instance across hot reloads via `globalThis.__multicamStoreCtx`. `useMulticamStore()` returns the whole store; `useMulticamStore(selector)` returns a slice (re-renders still follow the context).

**Fields (defaults)**
- Navigation/session: `tab:"camera"`, `role:"solo"` (`solo|host|slave`), `sessionCode:"POV-842"`.
- Recording: `recording:false`, `recordingStartedAt:null`, `paused:false`, `activeCamera:1`.
- Project: `markers:[]`, `cuts:[]`, `subtitles:[]`, `playhead:0`, `duration:62`, `playing:false`.
- Camera aids: `focusPeaking`, `zebras`, `wbLock`, `isoLock` (false), `grid:"thirds"`, `shutter:"1/48"`, `anamorphic:"off"`, `distortion:0`, `dualCamera:false`, `tracking:true`, `touchLocked:false`, `cleanFrame:false`, `wbKelvin:null`, `facing:"rear"`, `capMatrix:null`.
- Teleprompter: `teleprompter:false`, `teleprompterText` (welcome sentence), `teleprompterSpeed:35`, `teleprompterSize:24`.
- Capture: `capture = {resolution:"1080p", fps:30, codec:"VP9", mode:"normal", profile:"standard", micId:"", iso:null, focus:null, exposure:null}`.
- Look/post: `selectedLut:"Neutral"`, `customLutName`, `transition:"Dissolve"`, `chromaEnabled:false`, `chromaColor:"#36d462"`, `chromaTolerance:35`, `chromaSmoothness:20`, `eq: 10×0`, `deEsser:false`, `noiseReduction:20`, `autoGain:true`, `aspect`, `editMode`, `speed`, `scale`, `posX`, `posY`, `opacity`.
- System: `language:"ru"`, `hardwareAcceleration:true`, `cacheMB:0`, `diagnostics:{latency:0, bandwidth:0, online:true}`.
- Export: `exportOpen:false`, `exportProgress:0`, `exportConfig = {16:9, 4K, 24, H.264, 48 Mbps, AAC, 48kHz, 256 kbps}`.

**Actions**
| Action | Behaviour |
|---|---|
| `set(patch)` | Shallow merge. |
| `setTab(tab)` | Change tab. |
| `startSession(role)` | Sets role and random `POV-xxx` (not used by current UI). |
| `toggleRecording()` | No-op for slaves; flips recording, sets/clears start time, resets pause, bumps `duration` to ≥ 68 on stop. |
| `addMarker()` | Appends marker (see 3.4.5). |
| `switchCamera(n)` | Sets `activeCamera` and appends a `cut` at `playhead` (not used by current UI). |
| `setEqBand(i, v)` | Updates one EQ band. |
| `addSubtitles()` / `updateSubtitle(id, text)` | Store-level demo subtitles (not used by current UI; the editor uses its own overlays). |
| `applyPreset(cinema|reels|draft)` | Replace `exportConfig`. |
| `resetProject()` | Restore project defaults (see 3.6). |

**Persistence** — key `multicam-pov-state-native`: `language, hardwareAcceleration, selectedLut, exportConfig, markers, cuts, subtitles, teleprompterText, teleprompterSpeed, teleprompterSize`.

### 4.3 Local state by component
- **CameraTab:** `stream`, `cameraState`, `elapsed`, `tipKey`, `hud`, `sheet`, `self` telemetry; refs `videoRef`, `recorderRef`, `chunksRef`, `pipeRef`.
- **CaptureProPanel:** `caps`, `notice`, `mics`, `level`, `dropped`, `thermal`, `peakRef`.
- **EditorPro:** `media`, `items`, `overlays`, `muted`, `zoom` (40), `t`, `playing`, `selected`, `editing`, `subState`, `loading`, `prompter`, `vTracks`, `aTracks`, `transitions`, `selTr`, `trCat`, `ghost`, `dropErr`, `pinMon`, `pinTl`, `headerH`, `monH`, `loop`, `addOpen`, `importErr`; refs for video, preview, monitor, lanes, file input, pending import. Not persisted.
- **ConnectModal:** `step`; IdFlow `host`, `value`; QrFlow `host`, `qr`, `code`, `addresses`, `phase`, `error`, `paste`; Scanner `blocked`.
- **SettingsTab:** `privacy`, `checking`.

Editor data shapes:
- `Item {id, mediaId, kind, track, start, in, out, speed, reverse, scale, posX, opacity, look, color?}`
- `Overlay {id, text, x, y, size, color, bg, font, start, end, subtitle}`
- `Transition {id, track, aId, bId, type, dur}`

### 4.4 P2P mesh (`src/lib/mesh.ts`, `useMesh.ts`)
Singleton `mesh` with `selfId` (random 8 chars) and `name` (Android / iOS / Mac / Windows / Device from the user agent).
- **Messages:** `telemetry {name, battery, storageMB, recording}`, `record {on, at}`, `ping {t}`, `pong {t, to}`, `bye`.
- **Heartbeat:** every 2 s, sends telemetry and ping; drops peers not seen for 12 s. Latency = half round-trip of ping/pong.
- **send()** posts to the BroadcastChannel and every open data channel.
- **Signaling codes:** JSON → deflate-raw (`CompressionStream`, prefix `P1`) or raw (`P0`) → URL-safe base64. Offer `{k:"o", s:session, sdp}`, answer `{k:"a", sdp}`.
- **API:** `joinLocal(id)`, `leave()`, `createOffer(session)`, `acceptAnswer(code)`, `answerOffer(code)`, `sendTelemetry()`, `onMessage(fn)`, `subscribe/getSnapshot`.
- `useMeshPeers()` = `useSyncExternalStore(mesh.subscribe, mesh.getSnapshot, () => [])` (empty list during SSR).
- `mesh.selfRecording` is updated by CameraTab so telemetry reports the recording state.

### 4.5 Capability matrix (`src/lib/capabilities.ts`)
`CapabilityMatrix {probedAt, permissions{camera, microphone, storage}, rear: CameraCaps, front: CameraCaps, codecs[], microphones, native}`; `CameraCaps {available, deviceId, label, maxWidth, maxHeight, maxFps, resolutions[], fps[], highSpeed[], iso, exposure, focus, whiteBalance, colorTemperature, torch, zoom}`. `loadMatrix()` reads the cached copy (exported, not used at startup — the probe runs on every launch).

### 4.6 Native bridge (`src/lib/native.ts`, Android Java)
`registerPlugin("MultiCamNative")`; `isNative()` = native platform **and** plugin available; browser fallbacks are used otherwise.
| Method | Java implementation | Used by |
|---|---|---|
| `getCapabilities()` | Camera2: per camera id facing, MediaRecorder output sizes, fps ranges, constrained high-speed sizes/fps, CamcorderProfiles, ISO range, manual-sensor & tone-curve flags; codecs | `probeDevice`, `CaptureProPanel` |
| `getThermalStatus()` | `PowerManager.getCurrentThermalStatus()` (API 29+), temperature | `CaptureProPanel` (every 2 s) |
| `listAudioInputs()` | `AudioManager.getDevices(INPUTS)` typed usb / bluetooth / wired / builtin | not called by UI |
| `setPreferredAudioInput({id})` | Routes to the chosen input; starts Bluetooth SCO for BT | Mic dropdown |
| `startHighSpeedRecording({cameraId, width, height, fps})` | Constrained high-speed capture session → H.264 MPEG-4 file | not called by UI |
| `stopHighSpeedRecording()` | Stops and returns path and duration | not called by UI |
`MainActivity` registers the plugin before `super.onCreate`. `thermalLabel()` maps status 0–6 to Russian labels.

### 4.7 Storage map
| Store | Key / name | Content |
|---|---|---|
| localStorage | `multicam-pov-state-native` | Persisted store fields (4.2) |
| localStorage | `multicam-capability-matrix` | Last probe result |
| IndexedDB | DB `multicam-pov-media` v1, store `clips` (keyPath `id`) | Recorded clips `clip-<ts>` and imports `import-<ts>`: `{id, createdAt, camera, mode?, profile?, playbackRate?, blob, kind?, name?}` |
| Window event | `multicam-clips-changed` | Fired after every save; Editor reloads media |
| Downloads | `multicam-render-manifest.json`, `multicam.edl`, `multicam.xml`, `multicam-pov-YYYY-MM-DD.zip` | Export outputs |

No server, database, authentication or network API is used; all features work offline.

### 4.8 Internationalisation (`src/lib/i18n.ts`)
`useT()` returns `t(key)` and `tip(key)` based on store `language`. Full dictionaries exist for English and Russian, with fallback to English; Settings and nav labels carry their own 17-language tables. Many camera/editor labels and all `HELP` texts are hard-coded in Russian.

### 4.9 Module interaction diagram
```text
routes/index.tsx ─► MulticamApp ─► MulticamStoreProvider (context)
                       │  useMeshBridge ◄──► mesh (BroadcastChannel / WebRTC)
                       ├─ SplashScreen ─► probeDevice ─► native.getCapabilities
                       ├─ ConnectModal ─► mesh.joinLocal / createOffer / answerOffer / acceptAnswer
                       ├─ CameraTab ─► getUserMedia ─► MediaRecorder ─► IndexedDB clips ─► "multicam-clips-changed"
                       │     └─ CaptureProPanel ─► applyConstraints, AudioContext, native thermal / mic
                       ├─ EditorTab ─► EditorPro ◄─ readClips (IndexedDB)  ; ExportDrawer ─► downloads / JSZip
                       └─ SettingsTab ─► diagnostics, IndexedDB delete, resetProject
```

### 4.10 Error reporting
`src/lib/error-capture.ts`, `error-page.ts` and `lovable-error-reporting.ts` capture runtime errors and render the fallback error page; the root `ErrorComponent` reports with boundary `tanstack_root_error_component`.

---

## 5. Android Packaging
- `capacitor.config.ts`: `appId app.lovable.multicampov`, `appName "MULTI-CAM POV"`, `webDir ".output/public"` (the TanStack Start client build output), `server { androidScheme: "https", cleartext: true }`.
- `AndroidManifest.xml`: permissions INTERNET, CAMERA, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, BLUETOOTH_CONNECT, READ_MEDIA_IMAGES, READ_MEDIA_VIDEO, READ_MEDIA_AUDIO, READ_EXTERNAL_STORAGE (max SDK 32), WRITE_EXTERNAL_STORAGE (max SDK 29), ACCESS_MEDIA_LOCATION; camera feature optional; `requestLegacyExternalStorage="true"`; `<queries>` for IMAGE_CAPTURE, VIDEO_CAPTURE, VIEW video/*, SEND video/*; MainActivity `configChanges` orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density, `singleTask`; FileProvider `${applicationId}.fileprovider`.
- `variables.gradle`: minSdk 24, compileSdk 36, targetSdk 36. Launcher icons in all `mipmap-*` densities plus adaptive icons; splash images for portrait/landscape densities.
- CI: `.github/workflows/android_build.yml`; Russian build guide in `ANDROID_BUILD_RU.md`.

---

## 6. File Inventory
| File | Responsibility |
|---|---|
| `src/routes/__root.tsx` | HTML shell, head meta, 404 and error pages, QueryClientProvider |
| `src/routes/index.tsx` | `/` route, SEO head, renders MulticamApp |
| `src/router.tsx` | Router + QueryClient |
| `src/components/multicam/MulticamApp.tsx` | Shell, header, nav, mesh bridge, splash gating |
| `src/components/multicam/SplashScreen.tsx` | Startup probe UI |
| `src/components/multicam/ConnectModal.tsx` | ID / QR pairing, scanner |
| `src/components/multicam/CameraTab.tsx` | Viewfinder, HUD, dock, sheet, recorder; exports `TeleprompterControls`, `Accordion` |
| `src/components/multicam/CaptureProPanel.tsx` | Pro capture controls, meters, thermal; exports `codecMime`, `toneFilter` |
| `src/components/multicam/EditorTab.tsx` | Editor wrapper, Chroma/Audio panels, Export drawer |
| `src/components/multicam/EditorPro.tsx` | Preview, transport, timeline, tools, inspector, overlays, transitions, color |
| `src/components/multicam/SettingsTab.tsx` | Settings sections, diagnostics, privacy overlay |
| `src/components/multicam/Help.tsx` | `HELP` dictionary + `HelpDot` |
| `src/components/multicam/ProTip.tsx` | `useLongPress`, `LongPressLabel`, `ProTipPopover` |
| `src/components/multicam/useMesh.ts` | `useMeshPeers` |
| `src/lib/multicam-store.tsx` | Global store |
| `src/lib/mesh.ts` | P2P mesh |
| `src/lib/capabilities.ts` | Device probe |
| `src/lib/native.ts` | Capacitor plugin bridge |
| `src/lib/downloads.ts` | Text and ZIP downloads |
| `src/lib/i18n.ts` | Translations, `useT` |
| `src/styles.css` | Design tokens and custom classes |
| `android/.../MainActivity.java`, `MultiCamNativePlugin.java` | Native host and Camera2/audio/thermal plugin |

---

## 7. Layout & Editor Revision (supersedes conflicting rows above)
- **Bottom nav** is pinned flush to the screen bottom (full width, height `--nav-h` = 4.1rem + safe-area). The Camera screen height is `100% − --nav-h`, so the viewfinder spans from the header to the top of the nav (full height in Clean Frame).
- **Camera dock** sits 1.5rem above the nav; peer cards at 7.75rem. The "Hold any pro control for help" hint was removed.
- **Parameters sheet** fills the camera area (top-2 → bottom-2) and has a sticky header with a **Close (X)** button (`setSheet(false)`).
- **Lane headers** (72 px): video lanes have an **Eye** toggle (`hidden[vN]` — hides the lane from the preview, audio keeps playing) and a **Speaker** toggle (`muted[vN]`); audio lanes have a Speaker toggle (`muted[aN]`). Muted lanes are listed in store `exportMix.excludedAudio`, hidden lanes in `exportMix.hiddenVideo`; both are written into the render manifest (`tracks`).
- **Audio engine:** the preview `<video>` is always muted; sound comes from one hidden `<audio>` per audible item (audio clips on unmuted lanes, video clips with attached audio on unmuted lanes), synced to the playhead (play natively, correct drift > 0.3 s; reverse clips are silent).
- **Video sync:** while playing forward the preview video plays natively at the clip speed and is only re-seeked on drift > 0.3 s; paused/scrub/reverse use seeking. Timeline lanes are memoised so 60 fps playhead updates don't re-render them. Clip analysis (duration, peaks) and thumbnails are cached per clip id.
- **Filmstrip:** video clips show 10 cached JPEG frames tiled every 64 px along the clip (reverse-aware), with the waveform in the bottom third.
- **Playhead:** red triangle handle at the top of the playhead line; press and drag (or press the ruler) to scrub; pauses playback.
- The "Таймлайн · N видео · M аудио" caption was removed.
- **Toolbar:** one row of icon-only buttons with tooltips, in order: Добавить (opens Add menu), Разрезать, Удалить, Текст, Отделить звук, Офлайн‑субтитры, Телесуфлёр.
- **Editor panels:** Переходы / Цвет / Звук are a single tab bar (`panel` state). Tapping a tab opens its panel below and closes the others; tapping the active tab collapses it. The active tab has a primary border, tint and glow.

## 8. Crop, Zoom Bar, Transitions & Release Build (supersedes conflicting rows above)
- **Transport:** Loop removed. Slot 1 = **Crop** (enabled only when a video clip is selected); slot 2 = **Rewind**. In crop mode slot 1 becomes **Apply (✓)** and slot 2 **Cancel (✕)**; either closes crop mode and restores both icons. Apply stores `item.crop {x,y,w,h}` (% of frame; full frame clears it) rendered as `clip-path: inset(...)`; Cancel discards the edit.
- **Crop overlay:** draggable box (move by dragging inside, 8 edge/corner handles, min 10 %), rule-of-thirds guides, dimmed outside, buttons По вертикали / По горизонтали / По центру.
- **Zoom bar:** its own non-scrolling row under the transport: − button, logarithmic slider (8–600 px/s, thumb fixed 1.25rem), + button. Only the timeline scrolls horizontally.
- **Lane labels** are always "Video" / "Audio" (no numbers); the Inspector title uses the same labels.
- **Transitions:** 5 categories × 6 items — Базовые (dissolve, fade, flash, white, desat, dim), Движение (slide, wipe, zoom, slideV, wipeV, zoomOut), Эффекты (blur, glitch, spin, shake, invert, rainbow), Фигуры (iris, diamond, doors, doorsV, corner, diagonal), Объём (flip, flipV, cube, tilt, swing, fold).
- **Color / Sound tabs:** compact rows; the color hint sits on one line with its help icon.
- **Release build:** CI uses JDK 21 (Capacitor 8), passes `versionCode = run number`, signs via Gradle `signingConfigs.release` from `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` secrets (temporary key fallback with a warning), and outputs both a signed APK and a Play-ready AAB.

---

## Layout & audio update (camera, settings)
- **Camera top-right cluster:** Clean-frame toggle and AI toggle in the HUD row; directly under AI, a round front/rear camera switch (same right edge). The switch was removed from the bottom dock, which now holds Parameters · Shutter · Pause/Photo · Marker.
- **Camera top-left stack (top→bottom):** HUD chips row → PHOTO/VIDEO switcher → recording timer (`00:00.0`) → role/session label (`СОЛО · POV-842`, or recording/paused/controlled-by-host text).
- **Parameters sheet:** the standalone help dot that sat under "Hold to lock" (above "Объективы и зум") was removed. In "Объектив", the Anamorph help dot sits right after the "Анаморф" label.
- **Sound meter rail (`AudioRail`):** VU bar (−60…0 dB scale) + vertical **peak-ceiling** slider on the same scale (red line on the VU bar marks it) + gain −/reset/+ buttons (−24…+12 dB). State: `audioCeiling` (dB, default 0, not persisted), `audioGain` (linear).
- **Limiter (`src/lib/audio-limiter.ts`):** gain → DynamicsCompressor (threshold = ceiling, 20:1, knee 0, 1 ms attack, 50 ms release) → WaveShaper hard clip at the ceiling. Used by the meter and by the recorder (applied whenever gain ≠ 1 or ceiling < 0), so neither the meter nor the recorded audio exceeds the ceiling.
- **Vertical sliders (`ui/slider.tsx`):** track/range use orientation-aware sizes so the thumb stays inside the track.
- **Settings header:** the "MULTI-CAM POV" brand text is hidden on the Settings tab.
- **Privacy modal:** fixed between the app header and the bottom nav, with its own scroll area and an X close button.
- **Media library:** exists only inside the Editor (`EditorPro`), height-capped with internal scrolling.

## UI refinement (Oct 2026)
- Camera: front/rear switch sits in the bottom-left dock, immediately left of **Параметры**. Battery chip removed from the top chips row. Top-right cluster order: **AI**, then clean-frame eye.
- Параметры sheet: section headers have no "?" icons; **Ложные цвета** (`falseColor`) and **Звук‑метр** (`audioMeter`) items now carry HelpDots.
- Editor header: **Медиатека** button (folder icon) left of **Экспорт**, shown only on the Editor tab; toggles store `mediaOpen` (not persisted). Dropdown lists all stored clips; tapping one adds it to the timeline and closes the menu. The old inline media grid was replaced by this dropdown.
- Timeline ruler labels/ticks use full foreground colour for legibility. Glass panels use stronger blur plus inset highlight and drop shadow.

## UI refinement (solid surfaces, slim scrollbars, camera stack, sound meter)
- All surfaces are opaque: `--glass`/`--overlay` are solid, `backdrop-filter` is globally disabled, modal backdrops use `bg-background`.
- Scrollbars: global thin (5px) rounded thumb, transparent track; `.scrollbar-none` still hides them.
- Camera bottom dock center column, bottom→top: shutter, ФОТО/ВИДЕО selector, timer + role·session label.
- Звук‑метр (`AudioRail`): left = live level bar, right = black-knob slider. The knob sets `audioCeiling` (-60..0 dB) and maps linearly to `audioGain` (-24..+12 dB); the bar is clamped to the knob height. No text or +/- buttons.

## 2026-10-16 — Звук-метр (gain knob + VU + scale)
- AudioRail: VU bar and gain slider share identical height/width (both inside py-2 tracks, h-40).
- Right scale column (bottom→top): 0 дБ (mic muted), +6, +12, +18, +24, MAX.
- Knob 0…30 → live GainNode (0 = silence, 18 = unity, 30 = +12 dB) and limiter ceiling (−60…0 dB); recorder uses the same audioGain/audioCeiling.
- VU fill: multi-color gradient green→cyan→blue→purple→orange→red; never rises above the knob.

## Звук-метр: финализация ручки усиления (2026-10-17)
- Дефолт ручки — отметка +18 дБ (knob 18 из 30): store defaults `audioCeiling: -24`, `audioGain: 1` (вход 1:1 без буста). Раньше дефолт был MAX (ceiling 0 дБ → knob 30).
- `ui/slider.tsx`: `aria-label` теперь пробрасывается на Thumb (элемент `[role=slider]`), а не на Root — раньше accessible name терялся.
- `.gain-knob [role=slider]`: невидимая touch-зона 48px (`::before` inset −16px), `cursor: grab/grabbing`, `touch-action: none`. Драг — штатный Radix pointer-механизм (мышь+тач), обновляет GainNode/лимитер в реальном времени через `onValueChange`.
- Проверено Playwright (390×844, fake media): стартовое значение 18, драг вверх → 27, вниз → 3; VU-бар и трек одинаковой геометрии, шкала 0 дБ…MAX справа.

## 2026-10-17 — Звук-метр: native range slider
- Gain control is now a native `<input type="range" min=0 max=24 step=0.1>` (`.gain-range`), vertical via `writing-mode: vertical-lr; direction: rtl`. 48×48px thumb: white ring, black core. Browser handles all mouse/touch drag.
- Always starts at +18 dB on mount. 0 = mute, 18 = unity gain (1×), 24 = +6 dB. Limiter ceiling = −60 + v/24·60 dB (default −15 dB).
- `input`/`change` update the live GainNode, compressor threshold and clipper curve right away (the audio chain isn't rebuilt), then save `audioGain`/`audioCeiling` to the store so recording uses them too.
- The slider works even when no mic is available. Scale labels: 0 / +6 / +12 / +18 (bold) / +24 dB. The older Radix `.gain-knob` notes above no longer apply.

## Visual Skin (Screenshot 43, light premium)
- Tokens in `src/styles.css` `:root`: light lavender background, white cards, indigo→violet `--gradient-primary`, `--shadow-soft`, `--shadow-glow`, `--gradient-stage` (radial shell backdrop), radius 1rem.
- Skin overrides live in the "Light premium skin" block at the end of `styles.css`; they change colors/shadows only — no control moved, resized or reordered.
- Active states (nav tab, editor tab, connect pill, segmented, HUD chips) use the gradient + glow.

## Audio Meter ("Звук‑метр") geometry
- Column height `h-48`. VU bar `w-2.5` (widened), no gap to the native gain range; scale column `w-8`.
- VU bar and scale use `py-[24px]` = half the 48px thumb hitbox, so the bar's 0–100 % maps exactly to the thumb's travel; the level is clamped to the knob's ceiling, so the bar never passes the thumb.
- Range 0…+24, default +18 (unity). Thumb = 48px invisible hitbox around a white ring with primary core.

## Theme engine & contrast hardening (2026-10-18)
- `theme: "light" | "dark"` lives in the global store (`multicam-store.tsx`), persisted to localStorage with the other settings. `MulticamApp` toggles the `dark` class on `<html>`; all colors resolve through the semantic tokens in `src/styles.css` (`:root` = light, `.dark` = dark).
- Light palette: bg #F8FAFC with ambient gradient glow, cards #FFFFFF, borders slate-200, text #0F172A/#334155. Dark palette: bg #0B0F17, cards #1E293B, borders slate-700 with a 30% purple tint, text #F8FAFC/#CBD5E1.
- Primary accent gradient: `linear-gradient(135deg, #6366F1, #A855F7, #EC4899)` (`--gradient-primary`) used for the play button, active tabs/pills and the theme segment control.
- Zero-blending rule: every card, button, chip, timeline container and settings row carries a 1px `var(--border)` ring plus `--shadow-soft`; buttons get an active scale press and a hover lift. Card radius 20px, pill/button radius 12–16px.
- Settings opens with a "Theme" section: a 48px-high segmented Light/Dark control (Sun/Moon icons) localized for all 17 languages.
