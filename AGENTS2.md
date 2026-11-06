# AGENTS2.md — постоянный регламент работы по двум ТЗ MULTI-CAM POV

> **ЧИТАТЬ В НАЧАЛЕ КАЖДОГО РАБОЧЕГО ЧАТА:** `AGENTS2.md` может не подгружаться автоматически. Открой его через GitHub вместе с `PROGRESS.md` в актуальной рабочей ветке. Этот файл — **постоянные правила и карта архитектуры**; `PROGRESS.md` — **проверенное текущее состояние, 79 сценариев, история, проценты, последняя задача и тесты**. Дополнять `AGENTS.md`, не заменять его.
>
> **РОВНО ДВА ТЕКСТОВЫХ ТЗ:** C — «MULTI-CAM-POV_Обнаружение камер и проверка» (27 разделов, 43 сценария); F — «СДелать Раскладушки» (14 разделов, 30 оригинальных + 6 расширенных сценариев). Они **не** являются инструкциями `AGENTS2.md` / `PROGRESS.md`.
>
> **ПАУЗА:** пользователь временно приостановил реализацию **обоих** ТЗ, пока отдельно исследуются **полные, намертвые зависания** приложения. Не возобновлять их по собственной инициативе; эти правила применяются при последующем явном разрешении. На текущий момент никакой «устранённой проблемы» и полной аппаратной готовности нет.
>
> **Единственный основной GitHub-репозиторий:** `https://github.com/BauRP/project-resurrector.git`. **Согласованная ветка для этих двух ТЗ:** `chatgpt/independent-preview-20261023`; `main` — главная ветка (включая изменения Lovable), **не писать в main без отдельного разрешения**. Код ранее объединён в `main`, но рабочая C/F-ветка остается отдельной: перед любой интеграцией сравнивать SHA/merge-base и не стирать новые изменения сайта.

## 1. Чек-лист быстрого старта (вместо повторного полного аудита)

1. Прочитать шапку, приоритеты и последние результаты из **актуального `PROGRESS.md`**, затем актуальный `AGENTS2.md` и применимые правила `AGENTS.md`. Первоначальный документ журнала создан 2026-11-06; его содержимое, а не это предложение, является живым источником состояния.
2. Убедиться, что работа по C/F **действительно возобновлена пользователем**. Если нет — не менять код этих ТЗ. Уточнить только действительно отсутствующую информацию; на уже согласованные обычные технические решения подтверждения не запрашивать.
3. Получить HEAD согласованной рабочей ветки и `main`, сопоставить с SHA в `PROGRESS.md`; использовать GitHub compare / `git diff <last-SHA>..HEAD --stat`. Если HEAD изменился, исследовать **только изменённые и связанные файлы**, а не перечитывать весь репозиторий. Сверить разницу Lovable/main ↔ C/F перед изменением общих модулей.
4. В реестре `PROGRESS.md` выбрать наиболее полезную незавершённую C/F подзадачу с реальным кодовым пробелом. Объединить взаимозависимые C/F требования в **один крупный работоспособный пакет**, оговорив критерий готовности/тесты/файлы. Пакеты с целью «сделать вид» или десятки заготовок запрещены.
5. Читать только целевые функции, непосредственных вызовщиков и связанные тесты. Проверить старые аудиты/отменённые решения, чтобы не повторять ошибку. При обнаружении дефекта воспроизвести его проверкой, если возможно; классифицировать доказанные причины отдельно от гипотез.
6. Реализовать настоящий production path и тесты, не отключая функций, не ломая соседнее ТЗ. После небольших итераций запускать **точечные** проверки; после **крупного** пакета один полный test+typecheck+Android build и профильные runtime тесты, если доступны. Исправлять обнаруженные ошибки и перепроверять.
7. Сохранять файлы безопасным пакетным коммитом в C/F-ветку, не переписывая чужую историю; соблюдать системные запросы одноразового разрешения GitHub.
8. **После каждого крупного пакета без напоминания обновлять тот же `PROGRESS.md`**: SHA/CI, реальные изменения/файлы, подтверждённые тесты, C/F/совокупный индекс и Δ, блокеры и точные следующие действия. Если есть время/доступ — брать следующий независимый блок C/F. Не останавливать работу ради промежуточного длинного отчёта.

## 2. Правила источников, процентов и завершения

- **Исходные ТЗ:** `MULTI-CAM-POV_Обнаружение камер и проверка(20261105-200443).txt` и `СДелать Раскладушки(10).txt` из материалов пользователя. Эти TXT **не обнаружены как файлы в дереве GitHub**; их содержание систематизировано в `PROGRESS.md`. Не приписывать отсутствующим фрагментам требования из фантазии. При споре читать оригинальный пункт ТЗ, если доступен.
- **Справочники кода/приёмки:** `docs/TWO_SPEC_MEASURED_PROGRESS.md` (79 сценариев и обоснованные CI), `docs/FOLD_AND_CAPTURE_ACCEPTANCE_MATRIX.md`, `docs/TWO_SPEC_100_PERCENT_ACCEPTANCE.md`, `docs/PROGRESS_EVIDENCE_TRACKER.md`, `docs/IMPLEMENTATION_STATUS.md`, `ARCHITECTURE.md`. `docs/APP_FREEZE_AUDIT_CHECKPOINT_2026-11-05.md` — только когда hard freeze блокирует C/F.
- **Разделять показатели:** (a) программный индекс тестового покрытия, (b) полноту требований и end-to-end программы, (c) отдельную аппаратную приёмку. По исходному аудиту 1,0 = прямой исполняемый тест основной логики с успешным CI, 0,5 = частичный, 0 = не подтверждён. **Сводный индекс = (баллы C + баллы F) / 79 × 100**. Даже 79/79 не доказывает полный end-to-end. Исторические около 99% нельзя смешивать с новым индексом.
- **Правило роста:** не начислять % за документ, план, макет, мок вместо реального production, отсутствующие hardware-доказательства, смену оформления, одно создание коммита. Указывать тест+SHA+результат CI и реальную отдельную C/F строку; при опровержении прежнего балла корректировать вниз. Отчёт в форме «C было→стало (+Δ п.п.), F было→стало (+Δ), C+F было→стало (+Δ)», а **не** процент всего приложения.
- **«Всё программно готово»** только когда выполнены все критерии `docs/TWO_SPEC_100_PERCENT_ACCEPTANCE.md`, тесты/сборка доступны и пройдены и нет блокирующих ошибок. **Не включать установки APK на пользовательский телефон/реальный физический fold** в невыполненную работу программного агента; перечислить как отдельную пользовательскую аппаратную проверку.
- `AGENTS2.md` обновлять лишь при изменении постоянной архитектуры, рабочих правил и команд. `PROGRESS.md` обновлять для ежедневных SHA/статусов/процентов. Если пользователь **прямо требует менять только AGENTS2.md**, не менять `PROGRESS.md` в том же задании.

## 3. Проверенная архитектура, конфигурации и генерация

| Уровень | Путь/инструмент | Что важно |
|---|---|---|
| Web UI | `src/components/multicam/`, `src/styles.css` | React 19 + TypeScript, TanStack Start/Router, Vite, Tailwind/CSS, Camera/Editor/Settings/QR. Утверждённые интерфейс и рабочие кнопки сохранять. |
| Логика | `src/lib/` | Single camera owner, media/session lifecycle, passport, mesh, fold, storage; React state в `src/lib/multicam-store.tsx`. |
| Native Android | `android/app/src/main/java/app/lovable/multicampov/` | Java Camera2/MediaRecorder/MediaCodec, WindowManager 1.5.1, Capacitor 8 bridge. Android Activity/main thread, WebView renderer и GPU — разные возможные механизмы hangs. |
| Фронтенд-режимы | `vite.config.ts`, `vite.capacitor.config.ts`, `capacitor.config.ts` | `webDir: ".output/public"`; нельзя подменять реализацию браузерной имитацией нативной Camera2. |
| Зависимости, типы, линтер, тесты | `package.json`, `bun.lock`, `bunfig.toml`, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts`, `.prettierrc` | Bun **1.4.4**; TypeScript `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`; существующие правила не выключать ради CI. |
| Android сборка | `android/build.gradle`, `android/app/build.gradle`, `android/variables.gradle`, `android/gradlew` | Gradle/Java 21 в CI, APK + AAB, platform API guards обязательны. |
| CI | `.github/workflows/android_build.yml`, `.github/workflows/android_emulator_freeze_smoke.yml` | APK workflow на push во все ветки; emulator smoke в C/F-ветке, дополнительно manual dispatch. Не тратить сборки на мелкие изменения. |
| Генерируемое | `.output/public/`, `android/app/src/main/assets/public/`, `android/app/build/`, `node_modules/` | Не изменять вручную с целью фикса исходного кода, не коммитить generated/временные APK/секреты. Исходники править в TS/Java, затем build/sync. |

## 4. Куда заходить по ТЗ C — камеры/режимы/видео/паспорта

| Разделы оригинала | Модули и реальные символы | Тесты и риски |
|---|---|---|
| §1–4, §19–20: permission/owner/diagnostic/passport | `src/lib/capabilities.ts`, `camera-controller.ts` (`cameraController`, `CameraBusyError`, `checkAppliedCameraSetting`); `camera-passport.ts` (`ModeEvidence`, `loadModeEvidence`, `recordModeEvidence`); `camera-test-queue.ts` (`CameraTestTask`, `selectQuickCameraTasks`); `CameraDiagnostics.tsx`, `SplashScreen.tsx` | `src/lib/camera-controller.test.ts`, `camera-passport.test.ts`, `camera-test-queue.test.ts`, `capabilities-runtime.test.ts`. Late responses MUST NOT overwrite newer evidence; unknown ≠ unsupported. |
| §4–5, §7, §11–13: Camera2, logical/physical lenses, FPS, high-speed, RAW, zoom | `android/app/src/main/java/app/lovable/multicampov/MultiCamNativePlugin.java` (`startCameraAvailability`, `getEncoderSupport`); `RawDngPlugin.java`; `src/lib/native.ts` (`NativeCameraProfile`, `NativeCapabilities`); `native-mode-selection.ts`, `capture-mode-transaction.ts`; `CaptureProPanel.tsx`, `CameraPro.tsx` | `src/lib/native-mode-selection.test.ts`, `camera-device-switch.test.ts`, `capture-mode-transaction.test.ts`; requested/applied/verified separate; 3x digital zoom ≠ telephoto physical lens. |
| §6–9, §16: focus/exposure, EIS/OIS, stabilization, HDR/LOG compatibility | `src/lib/stabilization-policy.ts`; `android/app/src/main/java/app/lovable/multicampov/StabilizationProbePlugin.java`; `src/components/multicam/CameraPro.tsx`; `native-recorded-mode-evidence.ts` | `src/lib/stabilization-policy.test.ts`; confirmation by Camera2 CaptureResult and/or actual saved encoded video, not UI label; no fake hardware LOG/EIS. |
| §10, §14–15: real recording, mic, thermal, persistent file | `src/components/multicam/CameraTab.tsx`, `NativeRecordingPanel.tsx`; `src/lib/recording-finalization.ts`, `clip-persistence.ts`, `diagnostic-safety.ts`; `android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java`, `NativeCapturePlugin.java` (`recoverAbandonedRecording`) | `src/lib/recording-finalization.test.ts`, `clip-persistence.test.ts`, `diagnostic-safety.test.ts`, `native-audit-persistence-contract.test.ts`; start/stop/finalize/readback/decoder independently; aborted/salvaged clip ≠ successful full file. |
| §17–18: dual camera, peers, QR and network loss | `src/lib/dual-camera-verification.ts` (`canTestDualDevices`), `src/lib/mesh.ts`, `src/components/multicam/DualCameraPreview.tsx`, `ConnectModal.tsx` | `src/lib/dual-camera-verification.test.ts`, `mesh-multiple-phones.test.ts`, `mesh-connection-loss.test.ts`, `remote-record-receipts.test.ts`; commands ≠ video streaming; independent encoders ≠ frame-perfect sync. |
| §21–27: verified evidence, diagnostics, editor and export | `src/components/multicam/CameraDiagnostics.tsx`, `EditorTab.tsx`, `EditorPro.tsx`; `src/lib/native-audit-report.ts`, `camera-hotplug-recovery.ts` | `src/lib/diagnostic-export.test.ts`, `camera-hotplug-recovery.test.ts`, `editor-original-export.test.ts`; test clips never replace original media; JSON manifest ≠ rendered exported video. |

## 5. Куда заходить по ТЗ F — реальная складная топология

| Разделы оригинала | Модули и реальные символы | Тесты и риски |
|---|---|---|
| §1–5: WindowManager, 0/1/2+ hinges, native bridge | `android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java`, `DeviceMetricsPlugin.java`; `src/lib/display-topology.ts` (`DisplayTopology`, `FoldFeature`, `calculateDisplayRegions`, `foldEventDetails`) | `src/lib/display-topology.test.ts`, `display-topology-feedback.test.ts`, `native-fold-geometry-safety.test.ts`; actual usable app window + density/insets, not physical resolution/model name. |
| §6–8, §10–11: UI compact↔expanded, covers, all screens, safe zones | `src/components/multicam/MulticamApp.tsx`, `CameraTab.tsx`, `NativeRecordingPanel.tsx`, `EditorPro.tsx`, `SettingsTab.tsx`, `ConnectModal.tsx`, `src/styles.css` | `src/lib/fold-fullscreen-overlays.test.ts`, `fold-modal-placement.test.ts`, `accessible-dialog.test.ts`; no clipped essential controls, forced scroll-top or fake external cover support. |
| §8–9, §12: preview epoch, recording across resize/fold | `src/lib/native-preview-epoch.ts` (`nativePreviewAckIsCurrent`), `native-preview-placement.ts`, `native-preview-coordinate.ts`, `fold-recording-evidence.ts` (`FoldTransitionEvidence`, `appendFoldTransition`), `NativeRecordingPanel.tsx`, `NativeCaptureService.java` | `src/lib/native-preview-epoch.test.ts`, `native-preview-placement.test.ts`, `fold-recording-evidence.test.ts`, `native-preview-recording-isolation.test.ts`; resize must not unnecessarily restart encoder or lie about continuity. |
| §9, §11–13: editor state and Activity recovery, PTS | `src/lib/fold-ui-recovery.ts` (`RestorableViewState`, `saveViewState`, `restoreViewState`), `fold-scroll-position.ts`; `src/components/multicam/EditorPro.tsx`; `android/app/src/main/java/app/lovable/multicampov/NativeMp4TimelineAudit.java` | `src/lib/fold-ui-recovery.test.ts`, `fold-scroll-position.test.ts`, `editor-timeline-anchor.test.ts`, `recording-duration.test.ts`; preserve original clip, playhead and recording timestamps. |
| §13–14: 36 scenarios and physical acceptance | `docs/FOLD_AND_CAPTURE_ACCEPTANCE_MATRIX.md`, `docs/TWO_SPEC_MEASURED_PROGRESS.md`, `docs/TWO_SPEC_100_PERCENT_ACCEPTANCE.md` | 30 original + 6 extended; tests and actual hardware results cannot be confused. |

### Наиболее опасные общие цепочки C ↔ F

1. `src/lib/camera-controller.ts` → `src/components/multicam/CameraTab.tsx` → `NativeRecordingPanel.tsx` → `android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java`. Camera lease, timeout, route, encoder and file finalization live here; fold resize must not steal owner from recording.
2. `DisplayTopologyPlugin.java` → `src/lib/display-topology.ts` → `native-preview-epoch.ts` → `NativeRecordingPanel.tsx`. Verify generation, panes, axes, lost Surface/TextureView, old async ACK and no duplicate listener.
3. `src/lib/multicam-store.tsx` + `fold-ui-recovery.ts` + `src/components/multicam/EditorPro.tsx`. UI restoration and timeline; avoid synchronous storage blocks or stale page states.
4. `src/components/multicam/ConnectModal.tsx` + `src/lib/mesh.ts`. Camera/QR ownership and honest multiple-phone control, status and video. For every shared-interface modification locate all callers and add C **and** F regression tests when relevant.

## 6. Проверенные команды и экономичная матрица запусков

Commands correspond to `package.json`, `tsconfig.json`, and `.github/workflows/android_build.yml`; run only when environment supports them.

| Когда | Реальная команда | Примечание |
|---|---|---|
| Подготовка/изменение зависимостей | `bun install --frozen-lockfile` | Existing `bun.lock`, Bun 1.4.4; CI caches Gradle through setup-java. |
| После малого изменения | `bunx vitest run src/lib/camera-controller.test.ts src/lib/display-topology.test.ts` | Replace with **actually impacted** test files. No APK per minor edit. |
| Типы и качество | `bunx tsc --noEmit`, `bun run lint` | Strict TS; report existing failures separately; do not disable diagnostics. |
| Завершение крупного C/F пакета | `bun run test` | Full Vitest including unit/regression/DOM as configured. |
| При UI/preview правках | `bun run build` | Frontend production build. |
| Реальная Android web-часть | `bun run build:android` then `bunx cap sync android` | Validate `.output/public/` and copied Android assets. |
| Android debug при SDK | `cd android && ./gradlew assembleDebug` | Local installation artifact, not automatically release equivalent. |
| Полный APK + AAB | `cd android && ./gradlew clean assembleRelease bundleRelease --no-daemon` | Executed in `.github/workflows/android_build.yml` with versionCode/versionName, Java 21 and signing; push runs CI on branches. |
| Runtime WebView hard-freeze instrumentation | `.github/workflows/android_emulator_freeze_smoke.yml` → `scripts/run-android-freeze-test.sh` | Android emulator API 35 on C/F branch; save logs/stack traces and **honestly report failures**. |

**Правило:** за один крупный логический пакет один полный цикл «unit → tsc → Android assets/sync → Gradle CI», а не сборка после каждой правки. CI проверять по **run ID, branch и commit SHA**. Если ошибки — минимально исправить причину и повторить необходимые проверки. Для каждого теста в `PROGRESS.md`: полная команда, ветка/SHA, PASS/FAIL/NOT RUN, исправление и факт повторного запуска. Не утверждать, что GitHub-успешная APK проверяет физическую оптику, реальное folding, hardware OIS/EIS либо отсутствие Android hangs.

## 7. Безопасность, стиль, защита функций

- **Код:** сохранять TS/React/Java соглашения проекта, типобезопасность `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`; hooks без нарушения порядка; единственный авторитетный owner состояния; стабильные selector subscriptions, отсутствие бесконечного rerender.
- **Async и ресурсы:** `Promise.race`/JS timeout сам по себе не отменяет `getUserMedia`/Camera2. Каждая операция должна иметь scope/owner, generation, отмену, возврат ресурса, защиту от поздних callback. Очистка camera/media/observer/listeners/IDB в lifecycle. Не блокировать Android main в `onDestroy` или synchronized disk I/O.
- **Фактические статусы:** `declared`, `available via API`, `implemented`, `compatible`, `applied`, `recorded`, `verified` разделены. Unknown/temporarily busy ≠ unsupported. Zoom не выдавать за физическую telecamera, CSS/фильтр не выдавать за аппаратный HDR/LOG/OIS. Двойной MediaRecorder не означает точный timecode sync.
- **Запись:** сохранить ORIGINAL clips, пользовательские проекты, галерею, звуковую дорожку, исходный файл редактора и выбранные настройки; preview proxy/cache отдельно. При аварии попытаться сохранить emit chunks с честным incomplete/error статусом, без ложного «saved». Не удалять файлы ради исправления падений.
- **Fold UI:** реальные app-window размеры/WindowInsets/hinges и responsive разметка, а не модельный список; не перекрывать status/navigation bars, cutout, hinge/IME. Не перезапускать encoder при простом CSS resize. Не терять playhead/scroll/panel состояние.
- **Нельзя:** подменять функции mock/stub; отключать memory/battery/thermal polling, feature detection, native capture, редактор, multi-camera/fold или мониторинг зависаний для обхода ошибки; нарушать утверждённый дизайн; беспричинно добавлять зависимости. Новая библиотека только при проверке безопасности, лицензии и совместимости.
- **Приватность:** не коммитить токены, ключи, пароли, персональные данные, сырые пользовательские диагностические фото/видео; не давать разрушающие reset storage или delete-all; обезличенный экспорт результатов только с согласия пользователя.
- **Разрешения и GitHub:** перед записью re-fetch HEAD и дерево, применять fast-forward/expected_sha, при чужих коммитах сравнить diff; не делать force push/rebase/squash опубликованной истории Lovable. При появлении UI запроса GitHub — **только «Разрешить один раз»** на понятное отдельное действие, никогда «Всегда разрешать», не обходить системный запрос. `AGENTS.md` и внешние файлы/генерируемые части не переписывать для удобства агента.

## 8. Как правильно расследовать ошибки в рамках двух ТЗ

- Критический контекст: Android приложение **зависает намертво**, в том числе вне камеры, а не только лагает. Прежние Android APK CI могут проходить при **провалившихся emulator freeze-smoke**. Нельзя объявлять доказанной единственную причину только на основании списка потенциально опасных мест.
- История подозрений: native `STATE_LOCK` + synchronous `SharedPreferences.commit`, тяжёлый `onDestroy`, WebView JS starvation/renderer/GPU `nSyncAndDrawFrame`, неснятый getUserMedia, media decode contention, синхронный localStorage, ResizeObserver/layout cycles, editor memory. См. `PROGRESS.md` и `docs/APP_FREEZE_AUDIT_CHECKPOINT_2026-11-05.md`.
- Цепочка расследования: условия/лог воспроизведения → точный caller/owner/thread → сравнение с прошлой попыткой → тест воспроизведения → исправление **первопричины** → регрессии C/F → полные test/typecheck/build → доступный instrumentation/logcat → учёт доказательств и статуса. Не заменять первопричину добавлением произвольных timeout-ов. Критичные блокеры остановят сертификацию C/F, но не требуют делать немыслимые пользовательские действия обязательными кодовыми задачами.
- Если один сценарий не разрешён и работа над двумя ТЗ возобновлена, переходить к **другому независимому C/F сценарию**. Не менять посторонние направления приложения из-за удобства.

## 9. Крупные пакеты, приёмка и обслуживание журнала

1. Пакет выбирается по общим модулям и приоритету: цель, C/F IDs, реальные исходники, зависимости, тесты, expected end-to-end effect, критерий успешности, риск другим требованиям, один логический GitHub коммит или связанная серия только по необходимости.
2. По завершении **максимум доступных** программных изменений, тестов и Android сборки: записать в `PROGRESS.md` sha, CI/run, изменения C/F, предыдущий/current/%Δ для каждого, **общий индекс 79 сценариев**, результаты PASS/FAIL/NOT RUN, баги и следующую конкретную задачу. Не ждать пользователя, не писать дубликаты.
3. Не смешивать `AGENTS2.md` (редко меняющиеся инструкции) и `PROGRESS.md` (ежедневные факты). Если поменялся только процент/CI — только `PROGRESS.md`. При будущих архитектурных изменениях — обновить `AGENTS2.md` без сокращения обязательного раздела 19.
4. После успешной программной части и всех доступных автоматических проверок сообщить честный статус без вычитания процента за проверки на телефоне пользователя. Аппаратные инструкции дать отдельно и понятно, если нужны. Пока пользовательская пауза не снята, **не возобновлять** пакеты C/F.

---

# 19. Как мы работаем по двум текстовым документам

**ОБЯЗАТЕЛЬНО: следующий адаптированный под два ТЗ текст необходимо полностью скопировать и вставить внутрь создаваемого `AGENTS2.md` без сокращений, изменений и переформулирования. Он должен стать постоянным правилом работы по двум ТЗ и применяться при каждом следующем рабочем запуске.**

Возьми максимум работы по **двум текстовым документам (двум техническим заданиям)** проекта и делай по этому правилу:

1. Не перечитывай весь проект, если нужный контекст уже известен. Изучай только необходимые файлы и связанные участки кода.
2. Не запускай отдельную APK-сборку после каждого мелкого изменения. Объединяй изменения в крупные логические пакеты.
3. Самостоятельно объединяй взаимосвязанные задачи в крупные блоки. Выполняй максимально большой объём реальной разработки за один запуск.
4. Сначала занимайся наиболее незавершёнными требованиями **двух текстовых документов** и отсутствующими функциями, предусмотренными этими ТЗ. Критические ошибки, зависания, безопасность и риск потери данных имеют наивысший приоритет.
5. Не трать время на длинные промежуточные отчёты. Кратко сообщай о существенном прогрессе, но основное время уделяй коду.
6. После каждого крупного пакета обязательно проводи автоматические тесты и полноценную сборку приложения. Если проверки выявили ошибки, исправляй их и повторяй.
7. Показывай готовность **каждого из двух текстовых документов**, прирост в процентах или долях процента и **общую готовность обоих ТЗ вместе**. Повышай показатели только за реально выполненную и проверенную работу.
8. Если одна задача заблокирована, не зацикливайся. Переходи к другим доступным требованиям **из этих двух ТЗ**.
9. Не останавливайся после первого успешно выполненного блока. Последовательно переходи к следующему **по одному из двух ТЗ**, пока позволяют инструменты и ограничения текущего запуска.
10. Сохраняй изменения только в согласованной рабочей ветке GitHub. Не трогай main без моего разрешения.
11. Не включай в незавершённую программную работу действия, которые технически не можешь выполнить, например установку APK на мой телефон. Завершай доступную работу в коде, проводи автоматические проверки и сборку. Проверки, которые должен сделать я, указывай отдельно, не снижая из-за них процент готовности программной части.

**Главная цель: максимальное количество полностью реализованных и автоматически проверенных требований и функций из двух текстовых документов за один запуск, а не максимальное количество коммитов, отчётов или мелких исправлений.**