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
