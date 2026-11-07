# GitHub preview recovery report

## Result
The actual running application is based on the consolidated authoritative GitHub source, not a recreated screen. The source was already synchronized when this request began. The reproduced startup rendering defect was corrected in place, with no replacement of camera/editor/native implementations or styles.

## Source identity and comparison
| Evidence | Result |
| --- | --- |
| Authoritative repository | `https://github.com/BauRP/project-resurrector.git` |
| Authoritative branch | `main` |
| Initial workspace HEAD | `b545c974096004bfd6412789c9b541353df97df8` |
| Initial GitHub main HEAD | `b545c974096004bfd6412789c9b541353df97df8` |
| Initial identical root tree | `f629d96f3f2b26f1426543c527853bbf36faaab0` |
| Initial blob comparison | All 399 GitHub blobs hashed against on-disk contents: zero missing, zero different; remote tree was not truncated |
| Latest GitHub main checked on resumed verification | `56cc5f0e92ac8c87efb8d4f620d6be9e09165c68` |
| Resumed workspace HEAD | `56cc5f0e92ac8c87efb8d4f620d6be9e09165c68` |
| Resumed identical root tree | `854bb6b4dcc5349a1a5f6777a9d6f9e1060cb62f` |
| Local branch | `main` |

GitHub main advanced during the pause to a Lovable bot commit dated 6 November 2026, 02:03 UTC, directly descended from the initial commit. The resumed workspace already contained that exact commit. This is evidence of source propagation, not a hosted-settings read or proof of future sync configuration.

## Original and final connection
The configured hosted Git sync repository and branch cannot be inspected or changed through the available agent tools. Neither `.lovable/project.json` nor local remotes expose those settings. Local origin/secondary are Lovable infrastructure, not evidence of an older GitHub connection. No repository connection was changed, and no third repository was created.

The GitHub API connection **NomadSoft's GitHub API** was used only for read-only source verification in chat; it was not linked to the application and does not configure Git sync.

To verify the hosted setting, open **Project settings → Git** and check that the repository is **BauRP/project-resurrector** and the selected branch is **main**. Do not disconnect an existing correct connection: reconnecting creates a new repository, and Git sync cannot attach an existing repository. If a different repository is shown, that remains an unresolved platform-linkage issue, not something this report claims to have repaired.

## Recovery method and changes
1. Read the uploaded mandate and architecture inventory; inspect source, local revision, dirty state and existing preview errors.
2. Read GitHub commit/tree through the GitHub API; compare Git blob hashes to all local files. No fetch/reset/merge/branch switch/archive import was required or performed.
3. Reproduce the real preview error: `Missing getServerSnapshot, which is required for server-rendered content`.
4. Add the existing gate snapshot getter as the third `useSyncExternalStore` argument in both `CameraWorkspace.tsx` and `CameraTab.tsx`.
5. Update the existing ownership regression assertion; add a real server-render regression test covering both components through the actual store provider.
6. Update architecture rules, roadmap and this report. The recovery commit intentionally differs from GitHub's checked base by these narrowly scoped fixes and documentation.

No original files were missing or outdated, no local user edits needed reconciliation, and no source conflicts occurred. No styles, layouts, Android source, media pipelines, lockfile, dependencies or build configurations were changed. No destructive deletion or history rewriting occurred.

## Preview and cache verification
The existing Vite development server served the real TanStack application at `http://localhost:8080/`. Source changes reached it automatically; fresh browser launches and reloads loaded the fix. No manual restart or cache deletion was necessary. Fresh browser contexts had zero service-worker registrations. This does not establish the state of an already-installed worker in the user's separate browser.

At **910×899** and **390×844**, the real browser flow verified:
- Camera loads its actual controls and accurately offers **Enable camera**; no native success was fabricated.
- Editor initially has exactly one Video and one Audio empty attachment slot.
- Lane-specific plus controls immediately create additional real Video and Audio tracks: two slots become four.
- File choosers import a real generated WebM and WAV into the first respective lanes; video filmstrip and audio waveform appear, remaining lanes stay empty.
- Playback switches the real transport to Pause.
- After a full reload, track additions and imported media persist; the video reports `readyState = 4`, duration approximately 2.008 seconds, and the remaining two empty slots are preserved.
- Settings loads; Light/Dark switch works; Camera, Editor and Settings were captured in both themes. Existing authoritative gradients and compact controls were retained, including purple accents present in GitHub; no palette restoration was attempted.
- Fresh startup and navigation produce zero page errors after the fix, versus the reproduced missing-server-snapshot error before it.

## Tests and build evidence
- Initial authoritative suite: **136 test files / 752 tests passed**.
- Targeted recovery/ownership suite: **3 files / 9 tests passed**.
- Final suite: **137 test files / 753 tests passed**.
- Latest automatic preview build entries report **build OK** after the fix. Development server logs show Vite serving successfully.
- A separate TypeScript command and production/Android build were **not run manually**: this environment reserves project build/typecheck execution for its harness. The automatic preview build result is not presented as independent TypeScript or release-build evidence. Run the repository's CI for those separate acceptance checks.
- The only content route, `/`, retains its unique title, description, Open Graph and Twitter metadata.

## Remaining limitations
- Hosted Git sync configuration still needs a user settings check; source identity alone does not prove the connection setting.
- Android Camera2, actual lenses/microphones, foldable/multi-display insets, device freezes, native encoding/export and hardware recording were not exercised in this desktop browser. All native implementation files remain intact.
- Browser attachment/playback verification is not an Android hardware acceptance test or a real-camera recording test.
- Separate TypeScript, production and Android release-build acceptance remain unverified here.
- Historical unchecked overhaul items elsewhere in the roadmap predate this request; this recovery did not claim to complete them or override the consolidated GitHub design.