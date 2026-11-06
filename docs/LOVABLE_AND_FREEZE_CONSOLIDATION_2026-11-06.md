# MULTI-CAM POV — consolidation of Lovable and independent freeze work
Date: 2026-11-06. GitHub repository: BauRP/project-resurrector.

## Verified sources and preservation
- Lovable/site branch `main` at 0d1aeb07f8f43acb32e07259602eecc9e047b256; 14 commits after the shared ancestor `c561c05ca47883584ac6986c868a809d0a7ca266`, affecting 12 files.
- Independent freeze/camera/editor branch `chatgpt/independent-preview-20261023` at `7e1f26b443cb0eb882eaf885b0753aabc388819b`; 1510 commits ahead and 14 behind the site's main when first compared.
- `BauRP/multicam-studio` is a distinct older repository last updated 2026-10-06. November Lovable commits are in `BauRP/project-resurrector` main, not in that older repository.
- Integration branch is isolated; both source branch tips and `main` were not rewritten. The integration history has two parents, recording the original main branch as an ancestor, while retaining the independent work.

## Lovable 2026-11-02 changes ported into the independent app
1. Compact button sizes, subtle light/dark borders, smaller radius, header spacing and the glass visual accents.
2. One empty real Video and one empty real Audio timeline lane. Each lane's plus button adds a real track; empty lanes contain a file attachment slot with file type validation and a drop target.
3. Track state is capped to 1..64 lanes and saved alongside the editor project. Existing clips determine a minimum lane count so no saved clip becomes orphaned.
4. Lovable old storage `multicam-pov-project-layout` is *read-only fallback* when `multicam-editor-project-v1` is absent. No legacy data deletion; no camera or media blobs placed in localStorage. Other editor backups remain unchanged.
5. Fixed playhead origin and content-width accounting, preventing a left-hand timeline offset and horizontal scrolling when there is no media.
6. Microphone-gain slider layout and narrower export/audio-panel store subscriptions.
7. Added unit regression tests for reducer-backed lanes, zero playhead, old project metadata, and empty project state.

## Intentional conflict resolutions — do not blindly restore older Lovable files
- Keep independent `CameraTab.tsx`: real Camera2/native video, hotplug handling, cancellation for still photo capture, multiple lenses, recording and first-run camera passport would be lost by replacing it with main.
- Keep independent `EditorPro.tsx` media loader and multi-layer `EditorVideoLayer`, bounded background decoder queue, local data sanitation, real offline export pathways, fold scroll and monitoring. Lovable's older editor used one video tag and synchronous project writes in effect cleanup.
- Keep independent `EditorTab.tsx` export cancellation, accessible dialog, actual local video render and more recent editor layout. Ported the project's narrower subscriber hook without stripping export logic.
- Keep independent Android service, WebView freeze monitor, fold geometry and 111/222 theme work; site version is older.
- Don't apply universal `backdrop-filter` over all native Android Settings descendants; that risks the known HardwareRenderer stall.
- Preserve all feature code and existing test/CI files from the independent branch.

## Validation and outstanding risk
- GitHub Actions Android APK job #1561 for code state `97d9caa8` reported success, including Bun/Vitest, TypeScript, Capacitor build, Android APK/AAB.
- Previous independent Android emulator freeze smoke #142 failed, despite successful APK #1557. A passing build does **not** prove the hard-freeze root cause is resolved.
- A native emulator freeze smoke pass *on the final integration commit* is still necessary before declaring the Android navigation freeze fixed. Do not count real-device user actions as unfinished code work.
- Live camera lens availability, audio drivers, and actual saving/playback should be checked on hardware separately, after code-level checks.
- No automatic further merges or overwrites of `main` until the user is satisfied with the integration; connecting Lovable to the branch still requires the site's actual GitHub synchronization settings.

## Repository plan
- Single authoritative repo: `BauRP/project-resurrector`.
- Main site connection: `main` stays unchanged until approved for integration. Keep site edits paused during review to avoid rebasing new commits invisibly.
- Independent work: retained at `chatgpt/independent-preview-20261023` as immutable reference for this merger.
- Integration code: `integration/lovable-site-and-freeze-20261106` is the candidate. Review through GitHub PR into main, then fast-forward/merge only after checks and sign-off.
- Two pre-existing specification documents remain paused. Historical progress percentages are not evidence of hardware acceptance.

## Archive of the older separate repository
A complete tree comparison of `BauRP/multicam-studio` main (2026-10-06) against this integration branch found 152 tracked files in the old tree: 110 unchanged byte-for-byte, 40 updated here, and only TWO files absent here. Both missing historic Lovable planning documents were copied into the integration tree under their original paths. No old production file is missing by path. The 40 changed production/configuration/documentation files reflect newer functionality; they were not overwritten with the October code. The old repository's `.lovable/project.json` has a DIFFERENT template revision and must not overwrite the current project's identity or site linkage.
