# MultiCam Studio

# SYSTEM PROMPT: MULTI-CAM POV - Apple-Grade Autonomous Multicam Production Suite

## 1. PROJECT OVERVIEW & DESIGN SYSTEM (APPLE HUMAN INTERFACE GUIDELINES)

Build a production-grade, fully functional offline web app designed to be packaged via Capacitor into a native Android APK for "MULTI-CAM POV".

- Aesthetic & Styling: Premium Apple iOS / macOS Pro Software style. Clean, ultra-sleek, minimal dark mode interface (`#000000` pitch-black background with subtle `#1C1C1E` cards), frosted glass blur effects (`backdrop-blur-xl bg-white/10` or `bg-black/40`), smooth spring transitions (`framer-motion`), precise SF Pro style typography, crisp iconography (`lucide-react`), and intuitive tactile feedback states.

- Structural Layout: Fixed Bottom Navigation Bar with 3 primary tabs:

  1. Tab 1: Camera ("Camera")

  2. Tab 2: Studio / Editor ("Editor")

  3. Tab 3: Settings ("Settings")

NO MOCKUPS, NO STUBS, NO EMPTY HANDLERS (`() => {}`). Every button, slider, and toggle MUST mutate real application state (Zustand or React Context) and render reactive UI changes.

---

## 2. TAB 1: CUSTOM IN-APP CAMERA & P2P RECORDING CONTROL

The Camera tab must render a custom viewfinder with real live camera stream initialization (`navigator.mediaDevices.getUserMedia` with fallback to interactive camera simulation if permissions/hardware are restricted) and dynamic P2P Mesh state controls.

### A. P2P Host/Client (Master/Slave) Logic:

- Top Header P2P Bar: "Create Session" (Master) or "Join Session" (Slave).

- Master Role (Session Initiator): The red circular Record Shutter button is ACTIVE and unlocked. Pressing Record sends a P2P signal to all connected devices to start simultaneous recording.

- Slave Role (Joined Peer): The Record Shutter button is VISUALLY LOCKED (greyed out with a padlock overlay and "Controlled by Host" badge). The slave device cannot start recording manually; it listens for the Master's trigger signal.

- Peer Status Pill Overlay: Live indicator showing status, Battery %, and Free Storage MB of all connected devices (Cam 1, Cam 2, Cam 3).

### B. Viewport & Camera Tools Overlay:

- Active Tally Light: Red pulsing border framing the active camera feed when selected or recording.

- Focus Peaking Shader Toggle: Edge detection overlay highlights sharp areas in vivid neon green.

- Zebra Lines Overlay: Diagonal stripes overlay on overexposed frame regions.

- WB & ISO Lock Toggles: On-screen controls to fix White Balance and Exposure Values.

- Composition Grids: Toggles for Rule of Thirds, Golden Ratio, and dynamic Gyroscope Level Line.

- Shutter Angle Control: Manual shutter speed selector (e.g., 1/48s lock for 24fps cinema look).

- Optical Transformation: Anamorphic De-squeeze toggle (1.33x / 1.55x canvas stretching) and Lens Distortion Correction slider.

- Dual-Camera Toggle: Side-by-side front/rear camera preview layout.

- Auto-Tracking Overlay: Bounding box for local face tracking centered in real-time.

- On-Screen Teleprompter: Scrolling text overlay with variable speed slider and font size adjustment.

- Quick Marker Button: One-tap button during recording that writes timestamp markers into the current project session state.

- Screen Lock Button: Tap-to-hold button that locks the screen touches during recording to prevent accidental focus shifts.

---

## 3. TAB 2: MULTICAM STUDIO & MONTAGA EDITOR

When recording stops, raw video assets automatically sync into a unified local multi-track project state accessible by all peers.

### A. Multicam Player & Live Cut ("ПТС-Пульт"):

- 3-Channel Split View Preview Player.

- Live Cut Switching Keyboard/Touch Controls: Buttons "1", "2", "3" allow real-time angle switching during playback, dynamically recording cut points directly onto the timeline track.

### B. Timeline & Editing Engine:

- Magnetic Timeline (Ripple Edit): Deleting or trimming clips automatically snaps adjacent clips to close gaps.

- Waveform Audio Sync: Automatic audio cross-correlation calculation to align video tracks by audio peaks/clap transients.

- L-Cut & J-Cut Handles: Independent trimming handles allowing audio to start before video or vice-versa.

- Precision Controls: Shuttle Wheel (frame-by-frame scrub controller), Split Screen / Picture-in-Picture (PiP) mode, and Crop Tool (16:9, 9:16, 4:5, 1:1, 21:9 aspect switching).

- Speed Ramping: Bezier curve interpolation controls for smooth velocity changes with frame blending preview.

- Keyframe Animation: Keyframe nodes for scale, position X/Y, and opacity over time.

### C. Color, VFX & Audio Studio:

- 15 Built-in Cinema LUT Presets + Custom `.cube` LUT file uploader applied via WebGL/Canvas filters.

- Green Screen Chroma Keyer: Color picker eyedropper with tolerance and edge smoothness sliders.

- 10 Transitions: Dissolve, Fade B/W, Wipe, Zoom, Blur, Slide, Spin, Glitch, Flip, Flash.

- Auto-Color Match: Histogram matching button that aligns color temperature/tint across all 3 camera tracks.

- Audio Suite: Interactive 10-band Graphic EQ sliders, De-Esser toggle (4–8kHz damping), Noise Reduction slider, Auto-Gain Normalizer (-14 LUFS target).

- Offline AI Subtitles: Speech recognition engine simulation that auto-generates editable text subtitle blocks on the timeline.

### D. Export & Backup Drawer:

- Export Modal with full custom parameter inputs:

  - Formats: 16:9, 9:16, 1:1, 21:9. Resolutions: 360p, 720p, 1080p, 2K, 4K.

  - FPS: 24, 25, 30, 48, 50, 60.

  - Video Codecs: H.264, H.265/HEVC, VP9, AV1. Bitrate slider: 1.5 - 100+ Mbps.

  - Audio Codecs: AAC, MP3, Opus, FLAC, WAV (22.05kHz - 96kHz, 64-320 kbps).

  - Quick Export Presets: "4K Cinema", "Instagram Reels 60fps", "Fast Draft".

- Export XML / EDL: One-click export of project cut data for Premiere Pro / DaVinci Resolve.

- Project ZIP Backup: Bundles JSON project metadata, markers, and LUT presets into a downloadable `.zip` file.

---

## 4. TAB 3: SETTINGS & SYSTEM CONFIGURATION

Sleek iOS-style grouped list configuration interface.

### A. Language Selector:

Support all 17 languages with dynamic UI string translation and RTL layout handling:

1. `en` - English

2. `ru` - Русский

3. `kk` - Қазақ тілі

4. `pt` - Português

5. `es` - Español

6. `fr` - Français

7. `ar` - العربية (Must trigger full `dir="rtl"` layout alignment across the entire app)

8. `zh` - 中文

9. `ko` - 한국어

10. `ja` - 日本語

11. `de` - Deutsch

12. `it` - Italiano

13. `tr` - Türkçe

14. `pl` - Polski

15. `hi` - हिन्दी

16. `vi` - Tiếng Việt

17. `id` - Bahasa Indonesia

### B. General Settings & Diagnostics:

- P2P Mesh Network Diagnostic panel (Node latency, IP status, bandwidth test).

- Storage & Cache Manager (Clear temp proxies, cache usage indicator).

- FFmpeg Render Engine Defaults (Hardware acceleration toggles).

### C. Legal & Privacy:

- Positioned at the VERY BOTTOM of the settings list: "Privacy Policy" ("Политика конфиденциальности").

- Behavior: Tapping this item MUST open a full-screen sleek Apple-style modal window (`fixed inset-0 z-50` with glassmorphic header, close button, and empty styled scrollable container ready for privacy text).

---

## 5. TECHNICAL EXECUTION RULES

- Use React, Tailwind CSS, Framer Motion, and Lucide Icons.

- Implement robust state management so every interaction (recording, switching tabs, adding markers, applying LUTs, tweaking EQ, changing language) updates the app state instantly.

- Ensure strict responsiveness, smooth Apple-like animations, and complete offline autonomy.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/d4031da8-0d43-4ecf-ac36-a997d415fbf1).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
