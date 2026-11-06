# MULTI-CAM POV — frozen TЗ and current app-freeze investigation

Date: 2026-11-05. Repo: BauRP/project-resurrector. Work branch:
`chatgpt/independent-preview-20261023`. Do not change `main`.

## Paused work — preserve these exact scenario-index baselines

Source documents supplied by the owner:
1. `MULTI-CAM-POV_Обнаружение камер и проверка` (1,352 lines): **91.86%** = 39.5 / 43.
2. `СДелать Раскладушки` (783 lines): **76.39%** = 27.5 / 36.
Combined program-test evidence index: **84.81%** = 67 / 79. These are measured scenario coverage scores, not proof of total implementation or device behavior. Source: `docs/TWO_SPEC_MEASURED_PROGRESS.md`, change 12 (2026-11-03). Do not modify these values during stability-only work.

The conversation log `1(20261104-193435).txt` ended during the freeze audit, after the reported fixes for repeated layout measurement and editor-project persistence. The owner reported persistent freezes on startup, at Settings entry, on theme/actions, and after force-closing/relaunching Android emulator. Last release mentioned in that conversation: #1352. That release was *not* accepted as a freeze fix.

## Stability work is the ONLY active priority

Review the entire lifecycle from native Activity / WebView startup, splash, stored project, permissions, camera preview, cross-tab transitions, Settings/theme, renderer-intensive editor, background/foreground and reopened process. Never disable camera, camera checks, battery/storage monitoring, fonts, editing, or recording as a workaround. Do not change two paused specifications or claim 100% based on build alone. Designs 111/222 remain the owner’s visual reference; stability takes precedence.

Previously reported mitigations (not yet reproduced on the owner's Android emulator):
- guarded display geometry recomputation from resize/DOM callbacks;
- debounced editor-save operations and reduced duplicate load;
- bounded Camera2 ownership requests, media error recovery, and built-in freeze reporter.
These are candidate mitigations, NOT a confirmed root-cause diagnosis.

## New investigation improvement in this commit

The native watchdog previously ignored a WebView that never sent its first JS heartbeat. The watchdog now starts on Android Activity resume, marks missing first heartbeat, and attaches the latest explicitly triggered UI action to both Android-main-thread and WebView-stall reports. Trace calls are non-blocking, have no disk I/O during ordinary actions, and do not alter application functionality.

Acceptance of the freeze fix requires identifying and correcting reproducible stalls from real logs and passing Android CI. The present commit improves *observability* and cannot by itself establish that all freezes are eliminated. Device tests remain a separate owner activity.

Resumption trigger: after stability investigation/fixes are complete, return to the 79-scenario evidence index and resume exactly from the change-12 baseline, separately for each TЗ.
