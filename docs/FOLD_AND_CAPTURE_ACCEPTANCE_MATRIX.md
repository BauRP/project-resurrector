# Foldable and recording acceptance matrix (27 October 2026)

Evidence rule: **NOT VERIFIED** means no physical device or APK build was run in this batch.
The scenarios below are required checks, not claimed passing tests.

| ID | Device / condition | Expected camera/editor behavior | Status |
|---|---|---|---|
| 01 | Book fold closed / cover | Compact window, no inaccessible controls | NOT VERIFIED |
| 02 | Book fold fully open | Expand workspace from real app-window width | NOT VERIFIED |
| 03 | Repeated open-close | No leaked observers or mistaken hinge count | NOT VERIFIED |
| 04 | Live preview while folding | Correct aspect and no camera re-acquisition on resize alone | NOT VERIFIED |
| 05 | Recording while folding | Preserve frames when possible; disclose interruptions | NOT VERIFIED |
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
| 26 | Capture duration through fold | No false continuation; check saved segments | NOT VERIFIED |
| 27 | Narrow windows | No horizontal overflow | NOT VERIFIED |
| 28 | Hinge / system insets | No unreachable or occluded primary controls | NOT VERIFIED |
| 29 | Editor/control tapping | No unexpected scroll-to-top | NOT VERIFIED |
| 30 | Capability and viewfinder states | No fake/placeholder support claims | NOT VERIFIED |
| 31 | Single recorder microphone unplug | Show incomplete recording; salvage original bytes | NOT VERIFIED |
| 32 | Two recorders and mic unplug | Both streams finalize; no fake clean pair | NOT VERIFIED |
| 33 | High-speed 4K/FPS encoder | Bitrate has no 32-bit arithmetic overflow | STATIC FIX; APK NOT VERIFIED |
| 34 | Encoded MP4 sample timestamps rollback | Do not certify FPS | STATIC FIX; APK NOT VERIFIED |
| 35 | Slow editor playhead updates | Debounced persistence, flush on pagehide | STATIC FIX; APK NOT VERIFIED |
| 36 | Android Activity recreation | Restore UI-only state, never fake recorder continuation | NOT VERIFIED |

See source requirements: `СДелать Раскладушки(2).txt`, scenarios 1–30, and `MULTI-CAM-POV_Обнаружение камер и проверка(3).txt`, camera/video acceptance. A passing unit test cannot replace a physical-device observation.
