# PROGRESS.md — MULTI-CAM POV: постоянный журнал **строго двух ТЗ**

> **Назначение:** первая точка чтения для следующего ChatGPT/ИИ-агента. Журнал ведёт *только* два исходных технических задания: (C) «MULTI-CAM-POV_Обнаружение камер и проверка» и (F) «СДелать Раскладушки». Это не журнал всей разработки приложения, не замена исходным ТЗ и не AGENTS.md.  
> **Создан:** 2026-11-06. **Достоверность:** сведения об исполняемом коде и тестах берутся из GitHub и перечисленных документов; сообщения об аппаратной готовности без реального протокола не считаются подтверждением.  
> **Обновление обязательно:** после **каждого крупного пакета реальной разработки по C/F**, даже если пользователь забыл напомнить, обновить *этот же* файл в GitHub в той же согласованной ветке, зафиксировав конкретные изменения, тесты, прирост и точку продолжения. Не плодить файлы PROGRESS-v2 и не делать фиктивные прибавки.

## 0. СВОДКА НА 30 СЕКУНД (читать первой)

| Показатель | Текущее подтверждённое значение |
|---|---|
| Проект | **Multi-Cam Studio / MULTI-CAM POV**, Android камера/видеозапись, редактор, работа нескольких камер и устройств |
| **Единственный основной репозиторий** | [BauRP/project-resurrector](https://github.com/BauRP/project-resurrector) |
| Согласованная отдельная ветка разработки двух ТЗ | `chatgpt/independent-preview-20261023` |
| Проверенный HEAD рабочей ветки **до создания этого документа** | `7e1f26b443cb0eb882eaf885b0753aabc388819b` |
| Последний проверенный `main` | `56cc5f0e92ac8c87efb8d4f620d6be9e09165c68` (2026-11-06, Lovable изменил только `roadmap.md` после слияния, не путать с рабочей веткой) |
| Объединение прежнего сайта и независимой разработки | PR #3 объединён в `main` коммитом `b545c974096004bfd6412789c9b541353df97df8`; прежняя ветка C/F исторически отдельно |
| **ТЗ C: камеры и проверка** | **39,5/43 = 91,86%** индекс *покрытия прямыми автоматическими тестами*, а НЕ процент полностью завершённых требований |
| **ТЗ F: раскладушки и несколько экранов** | **27,5/36 = 76,39%** по той же шкале |
| **ОБЩИЙ индекс двух ТЗ** | **(39,5 + 27,5) / 79 × 100 = 84,81%** |
| Прирост от **создания журнала** | **C +0,00 п.п.; F +0,00 п.п.; вместе +0,00 п.п.**: создание документа не добавляет работающие функции |
| Аппаратные протоколы в найденном журнале | **0/43 C, 0/36 F**. Это не «нулевая программная готовность» |
| Текущий этап | **ОБА ТЗ ПРИОСТАНОВЛЕНЫ ПО РЕШЕНИЮ ПОЛЬЗОВАТЕЛЯ**, приоритет вне этих ТЗ — полные намертвые зависания приложения |
| Последнее тематическое изменение, учитываемое в индексе | 2026-11-03: расширены доказательства C-21/C-22, C-20, F-04, C-18/C-29; детали и CI в `docs/TWO_SPEC_MEASURED_PROGRESS.md` |
| Критический блокер | В Android/WebView возможен **полный мёртвый hang** при запуске, в Камере, Редакторе и Настройках. Не обычные лаги. Нет подтверждения устранения; Android emulator smoke #151 на интеграционной ветке завершён **failure** |
| Последняя известная успешная сборка интеграционной версии | Android APK #1572, коммит `249a66ee370dc5073c492dc4d09cdb55d24a415e`: успешны CI build/тесты, **но это НЕ доказательство устранения hang**. Доказательства теста не переносить автоматически между коммитами |
| Первая задача при возобновлении ТЗ | **C-05 OIS/EIS**: сверить фактически применённый режим и записанный файл, не допустить ложного «проверено»; **F-17/F-23/F-24**: реальные узкие/круглые дисплеи, крупный шрифт и TalkBack, без фиктивных возможностей |
| Первые файлы | `docs/TWO_SPEC_MEASURED_PROGRESS.md`, `docs/TWO_SPEC_100_PERCENT_ACCEPTANCE.md`, `src/lib/camera-passport.ts`, `src/lib/stabilization-policy.ts`, `src/lib/display-topology.ts`, `src/lib/fold-ui-recovery.ts`, `android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java` |

**Ключевая граница оценки:** 91,86% / 76,39% / 84,81% означают **индекс доказанного программного покрытия** из последнего формального аудита, НЕ фактически завершённый процент двух полных ТЗ. Старые сообщения «98–100%» и «99,9985%» не совместимы с данной методикой. До 100% программной части требуется выполнить *все* конкретные критерии `docs/TWO_SPEC_100_PERCENT_ACCEPTANCE.md`; физические испытания владелец выполняет отдельно, и они не превращаются в незавершённую **программную** задачу агента.

### Точные правила работы по этой сводке

1. Сначала прочитать этот файл и актуальный GitHub HEAD; не сканировать весь проект без необходимости. Сверить `main` и рабочую ветку: после объединения `main` содержит дополнительные коммиты, **не переписывать её и не делать blind force-push**.
2. Пока действует пользовательская пауза, **не возобновлять функциональную разработку C/F**. В отдельной разработке приложения критические hangs имеют высший приоритет, но **не превращать этот документ в журнал посторонних направлений**. Вести только сведения о блокирующем влиянии hangs на приёмку C/F.
3. При возобновлении открыть только соответствующие модули, точечные тесты и изменённые файлы после HEAD, затем взять связанный крупный блок C/F.
4. Ставить 1 / 0,5 / 0 строго по методике ниже; фиксировать SHA, CI и следы теста. Если тесты сломались — снижение балла допустимо и необходимо.
5. Сохранять оригинальные видео, медиапроекты, действующие возможности и проектную историю. Не отключать функции ради «улучшения» показателя.

---

## 1. Паспорт и техническая архитектура

- **Назначение:** Android-приложение камеры, фото и надёжной видеозаписи, продвинутого редактора, нескольких камер/телефонов, с истинной аппаратной диагностикой и адаптацией к складным устройствам.
- **Frontend:** React 19 + TypeScript, TanStack Start/Router, Vite, CSS/Tailwind, WebView; **native:** Capacitor 8 + Java/Android Camera2, MediaRecorder/MediaCodec, Jetpack WindowManager, Android Activity/Service. Тесты Vitest + Android Gradle/JUnit instrumentation.
- **Сайт-конструктор:** Lovable соединён с основным репозиторием; не переписывать опубликованную Git историю (см. `AGENTS.md`). **Превью сайта** не подтверждает Camera2/физический fold, даже если загружен тот же SHA.
- **Рабочая ветка для двух ТЗ:** `chatgpt/independent-preview-20261023`, отдельна от сайта и `main`. Код этой ветки ранее сопровождался своим журналом/CI; новая запись документа здесь **не сливает её автоматически в main**. При очередной разработке безопасно сравнить текущий `main` и рабочую ветку; не отменять изменения Lovable.
- **Платформенные границы:** Android API ограничивает Camera2, разрешения, работу при блокировке, foreground service, физические объективы; браузерный WebView API и нативный Camera2 — разные пути. Нельзя делать аппаратные гарантии по декларации API. Поддержка одного/двух/нескольких шарниров зависит от фактических событий WindowManager.
- **Программа контроля:** `package.json` → `bun run test`, `bun run build` и сборка `./gradlew assembleDebug` в каталоге `android` после подготовки Capacitor-ассетов; рабочий CI в `.github/workflows/android_build.yml`. Команды, требующие установленный Android SDK, исполняются через CI/доступную среду. `.github/workflows/android_emulator_freeze_smoke.yml` — отдельная Android runtime-проверка.
- **Закон сохранения:** не удалять пользовательские оригиналы/клипы при чистке кэша или сбое. Пробные диагностические записи отделять от пользовательской медиатеки; статус `saved` давать только после реальной транзакции/проверки; не считать JSON-манифест видеофайлом.

## 2. ПЕРВОИСТОЧНИКИ И ПРАВИЛО НЕПОДМЕНЫ ТЗ

### Два оригинальных ТЗ, найденные в материалах проекта

**C.** `MULTI-CAM-POV_Обнаружение камер и проверка(20261105-200443).txt`, 1352 строки, разделы 1–27; цель: достоверное обнаружение, проверка режимов и функций, безопасная запись, доказательства по каждому сенсору/режиму. **Прямой источник утверждённых требований.**

**F.** `СДелать Раскладушки(10).txt`, 783 строки, 14 разделов; цель: реальная автоматическая перестройка камер/редактора/настроек на book/flip/tri-fold/outward-fold/two-display на основе **настоящей** топологии окна, с сохранением записи. **Прямой источник утверждённых требований.**

Оригиналы предоставлены в истории/файлах ChatGPT и **не объявлены присутствующими в репозитории**. Если оригиналы недоступны следующему агенту, этот документ даёт подробный тематический индекс, а не разрешение выдумывать отсутствующие пункты.

**Непосредственно в GitHub (авторитет для уже выполненной работы):**
- `docs/TWO_SPEC_MEASURED_PROGRESS.md` — 79 строк, прямые тесты и изменения 2–3 ноября; **источник процентов**.
- `docs/FOLD_AND_CAPTURE_ACCEPTANCE_MATRIX.md` — расширенные F-31…F-36, fold/recording evidence.
- `docs/TWO_SPEC_100_PERCENT_ACCEPTANCE.md` — отделяет условие 100% программного выполнения от аппаратной приёмки.
- `docs/TWO_SPEC_CODE_COMPLETION_CHECKPOINT.md` — более ранние конкретные программные пробелы/коммиты.
- `docs/PROGRESS_EVIDENCE_TRACKER.md` — матрица C-01…C-43, F-01…F-36; исторические 98/99% **не использовать как метрику**.
- `docs/IMPLEMENTATION_STATUS.md` — подробный дневник реализованных механизмов/непроверенных ограничений.
- `docs/APP_FREEZE_AUDIT_CHECKPOINT_2026-11-05.md` — контекст блокирующих зависаний, читать только по связанным участкам.
- `AGENTS.md` — политика безопасной работы с Lovable/GitHub, не заменять и не удалять.

### Статусы решения и соответствие источнику
- **Утверждено C:** первый запуск диагностики с поэтапностью, разделение «заявлено/API/реализовано/совместимо/применено/проверено»; отдельный паспорт камеры/режима; честные неизвестные/временно занятые; запрет фиктивной стабилизации, LOG, 4K/FPS, одновременности, фоновой записи.
- **Утверждено F:** реальное WindowManager/размеры окна/insets/много hinge; не списки моделей как единственный механизм; адаптация *всех* экранов; сохранение реальной записи и данных через fold; ноль имитаций.
- **Утверждён пользователем порядок:** оба ТЗ **на паузе** из-за полного hard-freeze. Возобновлять только по явному указанию. Существующие функции не отключать. `main` не менять при согласованной отдельной рабочей ветке.
- **Условно/зависит от API:** внешний cover screen может быть закрыт ОС, два/три fold состояния доступны только если производитель действительно их сообщает; hardware-LOG, EIS/OIS, RAW/DNG, high speed, совместная камера и foreground запись не могут считаться доступными без проверок.
- **Временная реализационная политика C:** сначала подтверждённая EIS, затем OIS, затем допустимая программная постстабилизация; при перегреве безопасное ухудшение **необязательных эффектов**, но без скрытого изменения качества оригинала. Это начальная политика, не обещание одинаковых результатов на каждом телефоне.
- **Открытые вопросы:** какие физические устройства подтвердят конкретные режимы, какие OEM реально выставляют hinge/Camera2 данные; отсутствие таких фактов не подменять догадками.

---

## 3. Полный рабочий индекс требований ТЗ C — «Обнаружение камер и проверка» (27 разделов)

| Раздел оригинала | Обязательное поведение и критерии (без подмены фактической проверки) |
|---|---|
| §1 Правила | Первый запуск запускает настоящую ступенчатую диагностику, а не выдуманный процент. Шесть независимых уровней факта: **объявлено → доступно через API → реализовано приложением → совместимо → фактически применено → практически проверено**. У каждой функции и камеры свой результат и ошибки; «неизвестно» ≠ «не поддерживается». |
| §2 Архитектура | Раздельный Camera2/Capacitor и WebView путь; определить, какой метод реально проверяет/записывает режим. Любой статус привязан к конкретному способу. Управление разрешениями и единым владельцем камеры. |
| §3 Диагностика | Одноразовое первичное обследование с сохранением паспорта, **быстрая приоритетная** проверка для запуска и расширенная по требованию. Этапы: OS/API/permissions, устройства/сенсоры, фото/видео, резолюции/FPS/кодеки, ручное управление, OIS/EIS/софтовая стабилизация, HDR, звук, производительность, одновременность, результат. Очередь тестов, отмена, тайм-ауты, частичный прогресс, отложенные проверки при записи/нагреве/батарее. |
| §3.1–3.3 | Разделять лёгкий быстрый тест и дорогой длительный, независимые фото/видео режимы, очередность и ретраи. При отмене **действительно** закрывать потоки/сессии; поздние ответы не переписывают свежую истину, уже подтверждённый результат не теряется. |
| §4 | Все `CameraManager` логические/физические камеры, `getPhysicalCameraIds()`, front/back/external/auxiliary, ширик/основная/теле/макро/перископ **только по доказательствам**, сенсоры глубины отдельно. Наблюдать `AvailabilityCallback` и WebView `devicechange`; текущая занятость отдельно от аппаратной поддержки, изменения разрешений/USB обновляют доступность без стирания истории. |
| §5 | Для **каждого** cameraId + API + размера + FPS + кодека + стабилизации/HDR строить достоверные комбинации. В Camera2 учитывать StreamConfigurationMap/min frame duration, `VideoCapabilities`, лимиты encoder, dynamic range, high-speed session. В WebView отличать `getCapabilities()`, запрошенные constraints и реальный `getSettings()`, кодек/декодированный файл. Запрошенное не считать применённым. Транзакция выбора: request → pending → actual applied+recorded evidence → confirm; иначе rollback к последнему подтверждённому. |
| §6 | AF/fixed/manual/touch focus, реальные диапазоны/единицы (диоптрии, не условные проценты), лица/приоритеты/наведения; проверка фактического эффекта отдельно от команды. |
| §7 | ISO, выдержка, экспокоррекция, компенсации/AE/AWB, баланс белого, цвет, ограничения диапазона и совместимости; системные/программные эффекты не путать с аппаратными. |
| §8 | OIS, EIS, конфликтующие режимы/Android CaptureResult, совместимость FPS/кадрирования/зум. Выбор: подтверждённая EIS при пригодности, иначе OIS, иначе доступная постобработка; если неизвестно — прямо показывать «неизвестно». Проверять реально записанный файл (дрожание, кроп, задержка, FPS) и не выдавать программный эффект за сенсорную стабилизацию. |
| §9 | SDR/HDR/10bit/LOG/кодек: вся цепочка **сенсор → обработка → кодировщик → файл → воспроизведение → редактор → экспорт**. CSS контраст ≠ аппаратный LOG; пиксели canvas ≠ гарантированное аппаратное HDR. |
| §10 | Надёжная запись: истинный encoder start, fps/PTS, drop/dup, поток, аудио дорожка, остановка, размер/длительность/ориентация, транзакционный IndexedDB/диск и read-back, декодирование и редактор/экспорт (различать шаги доказательства). При ошибке/low storage/потере камеры/звука безопасно завершить и сохранить выпущенные данные без ложного «успешно». Фон и блокировка экрана строго по реальной политике Android, foreground service и разрешениям; не обещать непрерывность WebView записи без реализации. |
| §11 | Отдельные испытания **фото**, не переносить оценки видео: размеры, JPEG/RAW/DNG, вспышка, HDR, серия, брекетинг, ночь, длинная выдержка, фото во время видео; grab кадра из видео должен называться именно так. |
| §12 | Каждая передняя камера: свои размеры/FPS/focus/OIS/EIS, ориентация и зеркальность preview **отдельно** от видеофайла, распознавание лиц/отключаемая обработка при доступности, совмещение с задней. |
| §13 | Зум не равен физическому объективу; хранить request/applied/actual sensor/уверенность. Проверять переключение при записи, кадровые потери, FPS/stab, reinit/сегменты, координаты focus/metering/mirror/crop/orientation. |
| §14 | Каждый микрофон/USB/гарнитура: id, выбор *фактического* input, sample rate/channels/AGC/noise suppress, реальный аудиомаршрут, hotplug, interruption, A/V sync; хлопок как *необязательный* физический тест, тишина ≠ сбой. |
| §15 | Тепловой status, загрузка/память/место/диски/FPS/очереди, нагрузка preview+запись+эффекты+сеть. Не придумывать температуру; на перегреве снижать частоту анализа/качество *сетевого preview*, предупреждать/сегментировать при необходимости, не скрытно менять пользовательский оригинал. Отложенная тяжёлая диагностика не мешает съёмке. |
| §16 | Матрица конфликтов high FPS/выдержка, HDR/эффекты, stabilization/zoom, лица/focus, несколько камер/codec; единый механизм приоритетов запросов. |
| §17 | Две и более камеры: Camera2 concurrent groups / совместимость API, не принимать две отдельные камеры за гарантию двух одновременных кодировщиков. Реальные независимые session/record/save, персистентные парные клипы, честное доказательство синхронизации (не утверждать frame-accurate). |
| §18 | Несколько телефонов: отдельный паспорт/peer, команды ≠ передача видео; проверки preview/FPS/latency/clock drift/network/loss и локального оригинала. Отключение управляющего peer не уничтожает пользовательский файл. |
| §19 | Единый владелец Camera/QR/diagnostics/preview/record: закрыта → открывается → готова → перенастраивается → записывает → завершает → закрывается, interrupted/error; leases, cancellation, isolation, rollback. |
| §20 | Версионированный локальный паспорт с идентификатором камеры и пути, app/Android/WebView/engine versions, API, requested/applied, stream/encoder/file/decode/editor/export, date/load/thermal, ошибками, текущей доступностью, доказательством и происхождением. Статусы: заявлено / проверено / не поддерживается / неизвестно / не проверено / временно недоступно / ошибка / нет разрешения / API не раскрывает / приложение не реализует. Сохранять прошлые результаты при обновлении, помечать stale, не стирать при USB unplug. Обезличенный экспорт только по действию пользователя. |
| §21 | Автотесты API/mode/file и необязательные user-led проверки ближнего/дальнего focus, ходьбы/stab, передней зеркальности, хлопка, слабого света; **не заставлять** проходить их при установке. |
| §22 | Диагностические мини-клипы: отдельное bounded хранилище, жизненный цикл и очистка по правилам, не пользовательские проекты и не автоматическая передача на сервер. |
| §23 | UI отдельно «Выбрано», «Применено устройством», «Проверено записью»; операция показывает pending, при ошибке rollback и статус unknown/needs test, а не ложную поддержку. |
| §24 | Конкретные исходники и их обязательные исправления перечислены ниже в карте кода: `capabilities.ts`, `SplashScreen.tsx`, `native.ts`, `MultiCamNativePlugin.java`, `camera-controller.ts`, `CameraTab.tsx`, `CameraPro.tsx`, `CaptureProPanel.tsx`, `ConnectModal.tsx`, `mesh.ts`, `EditorTab.tsx`. |
| §25 | **43 обязательных сценария** с C-01…C-43, ниже *полная* покомпонентная таблица с прямым путём к тесту. |
| §26 | Девять очередных этапов: владелец+разрешения+паспорт → Camera2 ID → режимы/encoder+rollback → focus/экспозиция/zoom → OIS/EIS/software → highspeed/photo/HDR/audio/record → восстановление/perf → multi-camera/multi-phone/sync → итоговые тесты/правдивый UI. |
| §27 | Итог: для каждой **конкретной** камеры честно ответить, что она умеет, через какой API, что реально применено, записано, сохранено/открывается/экспортируется, каковы ограничения, источники доказательств и актуальность. |

**Особо важное для C:** невозможность аппаратной проверки на CI не делает соответствующий путь «не реализованным»; в то же время ни успешный unit test, ни ISO/OIS-кнопка не дают статуса «подтверждён на телефоне». Не смешивать отдельные виды фотосъёмки и видео, а также frontend export с созданием готового видео.

---

## 4. Полный рабочий индекс требований ТЗ F — «СДелать Раскладушки» (14 разделов)

| Раздел оригинала | Утверждённые требования |
|---|---|
| Непреложные правила | Только **реальная** конфигурация окна/hinge, не фиктивные кнопки «сложить», модели или демонстрации. Не удалять ни Camera/Editor/Connect/Settings, ни запись ради дизайна. Компиляция, CSS stretch и скриншоты не доказывают fold поддержку. |
| §1 Назначение | Автоматически переходить compact cover ↔ большая внутренняя область, допустимые book/tabletop/flip/tri-fold/outward/two-screen состояния, сохранять текущий user state и запись, не обещать доступ к закрытому cover screen, если ОС не позволяет. |
| §2 Размеры | Физическое разрешение из документа — **справка о железе**, не порог для CSS; использовать логические dp/CSS px, текущие реальные размеры *окна приложения*, плотность, orientation и insets, split screen. |
| §3 Устройства | Регрессионные цели: Samsung Z Fold6/7/8/Ultra, Z TriFold, Flip; Google Pixel Fold; Honor Magic V/V Flip; Oppo Find N/Flip; vivo X Fold/X Flip; Xiaomi MIX Fold/Flip; Motorola razr; OnePlus Open; Tecno Phantom V Fold/V Flip; Infinix ZERO Flip; nubia Fold/Flip; Blackview HERO; Huawei Mate X6 / Xs2 / Pura X / XT / XTs; Microsoft Surface Duo 2; Royole FlexPai 2. **Точные размеры и модели сверять по оригинальному §3**, не подменять рендеринг жёстким списком. Не выдумывать режимы Samsung TriFold: промежуточное положение может быть недоступно приложениям. Huawei tri-fold проверять только по реально раскрытой топологии. |
| §4 Реальная детекция | Jetpack WindowManager: `WindowInfoTracker`, `WindowLayoutInfo`, `FoldingFeature`, `DisplayFeature`; границы каждого hinge, orientation/occlusion/separating/flat/half-open; конфигурация Activity, current window metrics, insets, дисплеи. Поддерживать **список 0/1/2+ шарниров**, не один `hinge`. При недоступности данных обозначать unknown и адаптироваться по измеренному окну, не гадать. |
| §5 Мост | Реальный Capacitor native→WebView current-state query + подписка на изменения с очисткой; стабильный id/эпоха, viewport/density/insets/используемые регионы/источник каждого поля; безопасное преобразование координат native↔CSS без двойных insets и фиктивных перегородок. |
| §6 Поведение | Cover: компактная камера, видимые заголовок/подключение/preview/кнопка съёмки/вторичные прокручиваемые панели; открыто: реально более просторное превью, полезные боковые контролы, связные рабочие области; tri-fold: при подтверждённых 3 usable regions обоснованная многообластная компоновка, при недоступности — безопасный fallback. Flip half-open/tabletop: превью и контролы не через hinge. |
| §7 Брейкпоинты | Классы ширины, рекомендованные оригиналом: compact **<600dp**; medium **600–839dp**; expanded **840–1199dp**; large **1200–1599dp**; xlarge **≥1600dp**; **высоту оценивать отдельно**, особенно <480dp. Это ориентиры, не физические пиксели; Grid/Flex, container queries, dynamic viewport, без глобального scale. |
| §8 Камера | Стабильный header, самый большой разумный live preview без искажений, нижняя запись, переносимые панели управления. После resize/flip/zoom корректны mirror/crop/touch focus/AE/face overlays/grid/orientation. Переключение submenu не прокручивает всю камеру к началу. |
| §9 Не прерывать запись | Изменение CSS-панелей не закрывает Camera2/MediaRecorder; нужны независимые lifecycle owners, сохранение timer/mode/lens/stab/focus/device peers/editor state. При реальной Activity recreation/потере сессии безопасно закончить сегмент и сообщить, а не выдавать прерванный MP4 за непрерывный. Контроль устаревших событий через поколения. |
| §10 Safe regions | status/navigation/gesture bars, cutouts, rounded corners, IME, hinges, physical gap, side insets; не перекрывать действия, не удваивать отступы. Различать crease без occlusion и физическое разделение с gap. |
| §11 Все разделы | Splash, permissions, Camera, lens/pro controls, photo/dual, QR/Connect, Gallery, Editor и timeline, Export, Settings, dialogs, help, errors. Нельзя доработать только Camera и считать F завершённым. |
| §12 Производительность | Нет бесконечных ResizeObserver/React cycles, duplicate listeners, повторного camera open, лишнего encoder restart, stale async, FPS падения и утечек на повторном fold. Физический resize не запускает полную диагностику камер повторно. |
| §13 Испытания | **30 сценариев F-01…F-30** из оригинала + **6 расширенных F-31…F-36** из `docs/FOLD_AND_CAPTURE_ACCEPTANCE_MATRIX.md`, полный реестр ниже. |
| §14 Приёмка | Реальный fold/window signal, компактная↔широкая компоновка, multi-hinge без выдумки, рабочие inner/cover, доступность действий и сохранение видео через переходы, покрытие всех экранов, фактические результаты pass/fail и ограничения API; никаких макетов и необоснованной отметки готово. |

---

## 5. ДВЕ РАЗДЕЛЬНЫЕ ТАБЛИЦЫ ГОТОВНОСТИ: ПО ВСЕМ 79 СЦЕНАРИЯМ

**Правило балла, неизменно:** `1.0` = есть прямой исполняемый тест **основной программной логики** в успешном CI; `0.5` = код и косвенные проверки, но неполное прямое подтверждение; `0.0` = не найдено прямых проверок. `1.0` **не означает** закрытие всех ветвей требования, правильную физическую работу или 100% функциональную готовность. При ревизии изменять только с тестом+SHA+CI; без новых проверок прирост **0**. Ниже сохранена таблица исходного аудита `docs/TWO_SPEC_MEASURED_PROGRESS.md` без самостоятельного повышения баллов.

### 5A. Документ C: камеры, запись, паспорт — **39,5/43 = 91,86%**, Δ **+0,00 п.п.**

| ID | Сценарий | Балл | Кодовая проверка |
|---|---|---:|---|
| C-01 | Одна камера | 1.0 | `src/lib/camera-controller.test.ts` |
| C-02 | Несколько объективов | 0.5 | `src/lib/camera-passport.test.ts` |
| C-03 | Логическая камера | 0.5 | `src/lib/native-mode-selection.test.ts` |
| C-04 | Фиксированный фокус | 1.0 | `src/lib/camera-controller.test.ts` |
| C-05 | OIS/EIS | 0.5 | `src/lib/stabilization-policy.test.ts` |
| C-06 | FPS и стабилизация | 1.0 | `src/lib/stabilization-policy.test.ts` |
| C-07 | Фронтальная | 1.0 | `src/lib/capabilities-runtime.test.ts` |
| C-08 | Микрофон запрещён | 1.0 | `src/lib/capabilities-runtime.test.ts` |
| C-09 | Камера запрещена | 1.0 | `src/lib/camera-controller.test.ts` |
| C-10 | Камера занята | 1.0 | `src/lib/camera-preview-acquisition.test.ts` |
| C-11 | High speed | 0.5 | `src/lib/native-mode-selection.test.ts` |
| C-12 | Переключение объектива | 1.0 | `src/lib/camera-device-switch.test.ts` |
| C-13 | Разрешение/FPS | 1.0 | `src/lib/mode-verification.test.ts` |
| C-14 | Поворот | 0.5 | `src/lib/display-topology.test.ts` |
| C-15 | Фон/возврат | 1.0 | `src/lib/camera-foreground-recovery.test.ts`, `src/lib/capture-interruption.test.ts` |
| C-16 | Мало места | 1.0 | `src/lib/diagnostic-safety.test.ts` |
| C-17 | Перегрев | 1.0 | `src/lib/diagnostic-safety.test.ts` |
| C-18 | Внешний микрофон | 1.0 | `src/lib/camera-hotplug-recovery.test.ts`, `src/lib/recording-finalization.test.ts` |
| C-19 | Прерывание звука | 1.0 | `src/lib/recording-finalization.test.ts` |
| C-20 | Две камеры | 1.0 | `src/lib/dual-live-recording-lifecycle.test.ts` |
| C-21 | Несколько телефонов | 1.0 | `src/lib/mesh-multiple-phones.test.ts`, `src/lib/mesh-connection-loss.test.ts`, `src/lib/remote-record-receipts.test.ts` |
| C-22 | Обрыв сети | 1.0 | `src/lib/mesh-connection-loss.test.ts`, `src/lib/remote-record-guard.test.ts`, `src/lib/recording-finalization.test.ts` |
| C-23 | Отмена теста | 1.0 | `src/lib/mode-verification.test.ts` |
| C-24 | Старый ответ | 1.0 | `src/lib/camera-passport.test.ts` |
| C-25 | Обновление | 1.0 | `src/lib/camera-passport.test.ts` |
| C-26 | Паспорт | 1.0 | `src/lib/camera-passport.test.ts` |
| C-27 | MP4 проверка | 1.0 | `src/lib/clip-persistence.test.ts` |
| C-28 | Восстановление | 1.0 | `src/lib/capture-interruption.test.ts` |
| C-29 | Внешняя камера исчезает | 1.0 | `src/lib/camera-hotplug-recovery.test.ts`, `src/lib/camera-test-queue.test.ts` |
| C-30 | Временная занятость | 1.0 | `src/lib/camera-test-queue.test.ts` |
| C-31 | devicechange | 1.0 | `src/lib/camera-discovery-epoch.test.ts`, `src/lib/camera-test-queue.test.ts` |
| C-32 | Сенсор/FPS | 1.0 | `src/lib/native-mode-selection.test.ts` |
| C-33 | MIME без кодека | 1.0 | `src/lib/mode-verification.test.ts` |
| C-34 | Откат | 1.0 | `src/lib/capture-mode-transaction.test.ts` |
| C-35 | Запоздалое подтверждение | 1.0 | `src/lib/camera-controller.test.ts` |
| C-36 | Старт кодировщика | 1.0 | `src/lib/mode-verification.test.ts` |
| C-37 | IndexedDB | 1.0 | `src/lib/clip-persistence.test.ts` |
| C-38 | MediaRecorder finalization | 1.0 | `src/lib/recording-finalization.test.ts` |
| C-39 | Фон/блокировка | 0.5 | `src/lib/capture-interruption.test.ts` |
| C-40 | Foreground service | 0.5 | `src/lib/native-command-session-guard.test.ts` |
| C-41 | Остановка диагностики | 1.0 | `src/lib/diagnostic-safety.test.ts` |
| C-42 | Отчёт и источники | 1.0 | `src/lib/diagnostic-export.test.ts` |
| C-43 | Этапы диагностики | 1.0 | `src/lib/camera-test-queue.test.ts` |

**Частично покрытые строки C (0,5):** C-02 несколько физических объективов; C-03 логическая/физическая идентичность; C-05 реальные OIS/EIS; C-11 high-speed; C-14 поворот; C-39 фон/блокировка; C-40 Android foreground service/permissions. Наличие тестов в таблице доказывает только проверенные программные аспекты. **Следующие приоритеты**: C-05 и C-39/40; затем C-02/03/C-11/C-14; поперечная E2E запись C-20/21/22, корректный encoder-start, persistence и provenance C-36/37/42.

### 5B. Документ F: folding/дисплеи/непрерывность — **27,5/36 = 76,39%**, Δ **+0,00 п.п.**

| ID | Сценарий | Балл | Кодовая проверка |
|---|---|---:|---|
| F-01 | Book закрыт | 0.5 | `src/lib/display-topology.test.ts` |
| F-02 | Book открыт | 1.0 | `src/lib/display-topology.test.ts` |
| F-03 | Повторный fold | 1.0 | `src/lib/fold-recording-evidence.test.ts` |
| F-04 | Предпросмотр при fold | 1.0 | `src/lib/native-preview-epoch.test.ts`, `src/lib/native-preview-lifecycle-contract.test.ts`, `src/lib/native-preview-placement.test.ts` |
| F-05 | Запись при fold | 0.5 | `src/lib/fold-recording-evidence.test.ts` |
| F-06 | Настройки камеры | 0.5 | `src/lib/display-topology.test.ts` |
| F-07 | Редактор при fold | 0.5 | `src/lib/fold-ui-recovery.test.ts` |
| F-08 | Tabletop | 1.0 | `src/lib/display-topology.test.ts` |
| F-09 | Tri-fold одна часть | 0.5 | `src/lib/display-topology.test.ts` |
| F-10 | Tri-fold две части | 0.5 | `src/lib/display-topology.test.ts` |
| F-11 | Tri-fold открыт | 1.0 | `src/lib/display-topology.test.ts` |
| F-12 | Samsung ограничения | 0.5 | `src/lib/display-topology.test.ts` |
| F-13 | Huawei XT/XTs | 0.5 | `src/lib/display-topology.test.ts` |
| F-14 | Flip открыт | 0.5 | `src/lib/display-topology.test.ts` |
| F-15 | Flip полуоткрыт | 1.0 | `src/lib/display-topology.test.ts` |
| F-16 | Flip cover | 0.5 | `src/lib/display-topology.test.ts` |
| F-17 | Круглый экран | 0.5 | `src/lib/fold-fullscreen-overlays.test.ts` |
| F-18 | Outward fold | 0.5 | `src/lib/display-topology.test.ts` |
| F-19 | Два экрана | 1.0 | `src/lib/display-topology.test.ts` |
| F-20 | Поворот | 0.5 | `src/lib/display-topology.test.ts` |
| F-21 | Resize | 1.0 | `src/lib/display-topology.test.ts` |
| F-22 | Клавиатура | 1.0 | `src/lib/display-topology.test.ts` |
| F-23 | Крупный шрифт | 0.5 | `src/lib/fold-fullscreen-overlays.test.ts` |
| F-24 | TalkBack | 0.5 | `src/lib/accessible-dialog.test.ts` |
| F-25 | Touch focus resize | 1.0 | `src/lib/camera-controller.test.ts` |
| F-26 | Таймер через fold | 1.0 | `src/lib/recording-duration.test.ts` |
| F-27 | Без горизонтального overflow | 0.5 | `src/lib/fold-modal-placement.test.ts` |
| F-28 | Контролы и hinge | 1.0 | `src/lib/native-preview-placement.test.ts` |
| F-29 | Не прыгает к началу | 1.0 | `src/lib/fold-scroll-position.test.ts`, `src/lib/editor-timeline-anchor.test.ts` |
| F-30 | Нет выдуманных возможностей | 1.0 | `src/lib/fold-recording-evidence.test.ts` |
| F-31 | Обрыв mic 1 | 1.0 | `src/lib/recording-finalization.test.ts` |
| F-32 | Обрыв mic 2 | 1.0 | `src/lib/dual-live-recording-lifecycle.test.ts` |
| F-33 | 4K bitrate | 0.5 | `src/lib/native-audit-persistence-contract.test.ts` |
| F-34 | MP4 PTS rollback | 1.0 | `src/lib/native-recorded-mode-evidence.test.ts` |
| F-35 | Редактор курсор | 1.0 | `src/lib/fold-ui-recovery.test.ts`, `src/components/multicam/EditorPro.tsx` |
| F-36 | Activity recreation | 1.0 | `src/lib/fold-ui-recovery.test.ts` |

**Частично покрытые строки F (0,5):** F-01, F-05, F-06, F-07, F-09, F-10, F-12, F-13, F-14, F-16, F-17, F-18, F-20, F-23, F-24, F-27, F-33. Особо критичны F-05 (запись на fold), F-17 (круглый/узкий cover), F-23/24 (крупный шрифт/TalkBack), F-33 (4K bitrate). **1,0 по F-26 или F-36** означает наличие прямого теста основной логики, **не доказательство** непрерывной записи при физическом складывании.

### 5C. Совместный показатель

| Шкала | C | F | Итого |
|---|---:|---:|---:|
| Программный **индекс покрытия тестами**, дата базового аудита 2026-11-03 | 39,5 / 43 = **91,86%** | 27,5 / 36 = **76,39%** | **67 / 79 = 84,81%** |
| Прирост **именно за создание PROGRESS.md** | 0,00 п.п. | 0,00 п.п. | 0,00 п.п. |
| Аппаратные pass-протоколы из доступного журнала | **0/43** | **0/36** | **0/79** |
| Подтверждение *полного программного* выполнения всех условий | Не установлено | Не установлено | **Не заявлять 100%** |

**Не использовать среднее (91,86 + 76,39) / 2:** правильное общее значение учитывает 43 и 36 сценариев, то есть 67 / 79.

---

## 6. КАРТА КОДА — точные файлы, зависимости, проверка, риски

Пути проверены по дереву GitHub. Для каждой строки: **реальная ответственность, связи, уже существующее тестовое доказательство и что остаётся проверять**. Это **не** обещание работоспособности на устройстве.

### 6A. Камеры и надёжная запись (C)

| Файл / модуль | Что делает, ключевые символы и связи | Проверка / риск / следующий шаг |
|---|---|---|
| `src/lib/capabilities.ts` | Обнаружение WebView camera API, permission, modes; данные для Camera UI и начальных проверок | `capabilities-runtime.test.ts`, `capabilities-startup-cancellation.test.ts`; сверить отдельные physical IDs и отказ/тайм-аут |
| `src/lib/camera-passport.ts` | `VerificationState`, `ModeEvidence`, `loadModeEvidence`, `recordModeEvidence`, ключ `multicam-mode-evidence-v1`, контекст версии engine | `camera-passport.test.ts`; проверить путь Camera2 ↔ WebView, durable provenance, устаревшие версии; не считать localStorage полной аппаратной сертификацией |
| `src/lib/camera-test-queue.ts` | `CameraTestTask`, `CameraQueueStatus` pending/running/verified/recorded/retry/deferred/error, `prepareCameraTestQueueByDevice`, `selectQuickCameraTasks`, ключ `multicam-diagnostic-queue-v1` | `camera-test-queue.test.ts`; real abort, thermals, потеря внешней камеры |
| `src/lib/camera-controller.ts` | `cameraController` общий owner/потоки/очередь настроек; `CameraBusyError`, `CameraSupersededError`, `checkAppliedCameraSetting`, touch focus conversion | `camera-controller.test.ts`; проверять гонку по навигации, pending getUserMedia и реальное освобождение |
| `src/lib/camera-owner-handoff.ts`; `src/lib/camera-preview-acquisition.ts` | Управление передачей владения Camera2↔WebView/QR и защитой открытия preview | `camera-owner-handoff.test.ts`, `camera-preview-acquisition.test.ts`; не открыть один сенсор одновременно |
| `src/lib/camera-discovery-epoch.ts`; `src/lib/camera-hotplug-recovery.ts` | Поколения `devicechange`, `verifyCameraPresence`, `verifyMicrophonePresence`, запрет поздних результатов и ложного disappearance | `camera-discovery-epoch.test.ts`, `camera-hotplug-recovery.test.ts`; реальный USB/permission lifecycle |
| `src/lib/capture-mode-transaction.ts`; `src/lib/native-mode-selection.ts` | `assessTrackMode`; совместимость request/applied, encoder H.264, rollback и паспорт | `capture-mode-transaction.test.ts`, `native-mode-selection.test.ts`; полноценный encoder/file proof по комбинации |
| `src/lib/stabilization-policy.ts`; `src/components/multicam/CameraPro.tsx` | EIS/OIS/software режим, focus, zoom/объективы, профессиональное UI | `stabilization-policy.test.ts`; C-05 0,5: CaptureResult + реальный file result ещё не полностью доказан |
| `src/lib/dual-camera-verification.ts`; `src/components/multicam/DualCameraPreview.tsx` | `canTestDualDevices`, два независимых MediaRecorder/WebView stream, короткие диагностические клипы/декодирование | `dual-camera-verification.test.ts`, `DualCameraPreview.test.ts`; OEM concurrent combinations и истинная непрерывность |
| `src/lib/recording-finalization.ts`, `src/lib/recording-duration.ts`, `src/lib/recording-state-recovery.ts`, `src/lib/recording-indexed-chunks.ts` | MediaRecorder lifecycle, onstart/onstop/error, chunk persistence и monotonic timing | Соседние `*.test.ts`; incomplete MP4 не маркировать success, подтверждать readback |
| `src/lib/clip-persistence.ts` / `src/lib/native-recorded-mode-evidence.ts` и соответствующие тесты | Durable clip verification и достоверная интерпретация width/FPS/MP4 evidence | `clip-persistence.test.ts`, `native-recorded-mode-evidence.test.ts`; всё видео, а не лишь первый кадр |
| `src/lib/native.ts`; `src/lib/native-capture.ts` | Реальный bridge/типизация/тайм-ауты к Android, `NativeCameraProfile`, `NativeCapabilities`, `NativeThermal`, plugin methods | Сверить каждый JS API с Java методом; поздние promises не должны владеть новым сеансом |
| `android/app/src/main/java/app/lovable/multicampov/MultiCamNativePlugin.java` | Camera2 capabilities, `startCameraAvailability`, `getEncoderSupport`, high-speed и аппаратные сведения | `native-mode-selection.test.ts`; актуальный Android API gate и физические IDs/encoder constraints |
| `android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java`; `NativeCapturePlugin.java` | Native Camera2/MediaRecorder, foreground service, остановка/безопасное восстановление, `recoverAbandonedRecording` | `native-audit-persistence-contract.test.ts` и Android smoke; C-39/40, lock contention, фактическая MP4 finalization |
| `android/app/src/main/java/app/lovable/multicampov/NativeCaptureAuditStore.java`; `NativeMp4TimelineAudit.java`; `StabilizationProbePlugin.java`; `RawDngPlugin.java` | Технические доказательства Camera2/MP4 timeline/OIS/EIS и RAW DNG | `native-mp4-track-audit.test.ts`, `native-video-evidence.test.ts`; честное отделение декларированной от записанной поддержки |
| `src/components/multicam/SplashScreen.tsx`; `CameraDiagnostics.tsx` | Стартовая стадия и расширенная очередь диагностики, `AbortController`, priority, безопасное использование камеры | `capabilities-startup-cancellation.test.ts`, `camera-test-queue.test.ts`; при UI freeze/timeout не терять частичный паспорт |
| `src/components/multicam/CameraTab.tsx`; `CameraWorkspace.tsx` | Основной preview и MediaRecorder, разрешения, микрофон, single/dual, mode state, клипы | `camera-hotplug-recovery.test.ts`, `recording-finalization.test.ts`; навигационные lifecycle и сохранение оригиналов |
| `src/components/multicam/CaptureProPanel.tsx` | UI реальных resolution/FPS/codec комбинаций, high-speed, mode transaction | `mode-verification.test.ts`, `native-mode-selection.test.ts`; никогда не называть заявленную комбинацию проверенной |
| `src/components/multicam/ConnectModal.tsx`; `src/lib/mesh.ts` | QR/WebRTC/peer events, команды удалённых записей, паспорта/телеметрия | `mesh-multiple-phones.test.ts`, `remote-record-receipts.test.ts`, `mesh-connection-loss.test.ts`; remote video ≠ command, C-21/22 |
| `src/components/multicam/EditorTab.tsx`; `EditorPro.tsx` | Реальный editor/display/save/export для анализа результата записи | `editor-original-export.test.ts`, `editor-real-panels-runtime.test.tsx`; JSON manifest ≠ готовое видео; не маскировать ограничение |
| `src/lib/diagnostic-safety.ts`; `src/lib/native-audit-report.ts` | Запрет тяжёлой диагностики при перегреве/low battery/активной записи, безопасное происхождение данных/экспорт | `diagnostic-safety.test.ts`, `native-audit-export.test.ts`; C-41/C-42 и приватность |

### 6B. Складные/мультидисплейные устройства (F)

| Файл / модуль | Функция и связи | Проверка / риск / остаток |
|---|---|---|
| `android/app/src/main/java/app/lovable/multicampov/DisplayTopologyPlugin.java` | Реальные WindowManager `WindowLayoutInfo`, bounds, оси, posture и surface lease, проверка `isUnsafeDirectPreviewWindowRect`; нативный источник `fold` | `display-topology.test.ts`, `native-fold-geometry-safety.test.ts`; OEM события и 2 hinges, чистка listeners |
| `android/app/src/main/java/app/lovable/multicampov/DeviceMetricsPlugin.java` | Метрики экрана/плотность/insets для платформенного слоя | Сверить с CSS scale и безопасными областями; избегать удвоения insets |
| `src/lib/display-topology.ts` | `DisplayTopology`, `FoldFeature`, `windowClass`, `calculateDisplayRegions`, `foldEventDetails`, `safeViewportDimension`; native↔CSS геометрия | `display-topology.test.ts`, `display-topology-feedback.test.ts`; short-hinge и mixed-direction, F-09/10/F-20 |
| `src/lib/native-preview-epoch.ts`; `native-preview-placement.ts`; `native-preview-coordinate.ts` | `nativePreviewAckIsCurrent`, актуальность нативной TextureView после fold, реальная safe-area и координаты | `native-preview-epoch.test.ts`, `native-preview-placement.test.ts`; compositor ack гонки, preview не перекрывает hinge |
| `src/components/multicam/NativeRecordingPanel.tsx` | Нативный preview, fold/resize перерегистрация поверхности без остановки encoder | `native-preview-lifecycle-contract.test.ts`; real fold/recreation, F-04/F-05 |
| `src/lib/fold-recording-evidence.ts` | `FoldTransitionEvidence`, `FOLD_EVENT`, `normalizeFoldTransition`, `appendFoldTransition`, `foldContinuitySummary` | `fold-recording-evidence.test.ts`; F-05 физическая непрерывность не подтверждена |
| `src/lib/fold-ui-recovery.ts` | `RestorableViewState`, `saveViewState`, `restoreViewState`, `multicam-view-state-v1`; editor/playhead/view-state | `fold-ui-recovery.test.ts`; F-07/F-35/F-36, не допускать записи неверного состояния при remount |
| `src/lib/fold-scroll-position.ts`; `src/components/multicam/EditorPro.tsx` | Сохранение scroll/timeline playhead, аннулирование устаревшей геометрии | `fold-scroll-position.test.ts`, `editor-timeline-anchor.test.ts`; F-29/F-35 при реальном hinge |
| `src/components/multicam/MulticamApp.tsx`; `CameraTab.tsx`; `CameraWorkspace.tsx` | Общая навигация/viewport, Camera folding, взаимодействие control overlays; полная UI переразметка | `fold-modal-placement.test.ts`, `fold-fullscreen-overlays.test.ts`; особенно F-06/F-27, короткие окна |
| `src/components/multicam/ConnectModal.tsx`; `EditorTab.tsx`; `SettingsTab.tsx` | QR, редактор и настройки должны вписываться в usable panes, keyboard/large font/TalkBack | `fold-fullscreen-overlays.test.ts`, `accessible-dialog.test.ts`; F-23/F-24 0,5 |
| `src/styles.css` | Применение safe viewport/hinge/inset/compact vs wide screen и графика | `fold-modal-placement.test.ts`; не растягивать 9:16 декоративно вместо реальной геометрии |
| `android/app/src/main/java/app/lovable/multicampov/NativeCaptureService.java`; `NativeMp4TimelineAudit.java` | Recording state/PTS/аудио/MP4 доказательства в моменты fold, включая Activity recreation | `native-recorded-mode-evidence.test.ts`, `recording-duration.test.ts`; F-05/F-33 и действительная непрерывность |
| `src/lib/recording-finalization.ts`; `src/lib/dual-camera-verification.ts` | Сохранение original clips при потере источника, audio interrupt single/dual | `recording-finalization.test.ts`, `dual-live-recording-lifecycle.test.ts`; F-31/F-32, не путать спасённый файл с гарантированно полным |

---

## 7. Реестр известных проблем, блокировок и рисков СТРОГО для C/F

| ID | Серьёзность / статус | Проявление и доказательства | Место и решение / проверка |
|---|---|---|---|
| B-01 | **БЛОКИРУЮЩАЯ, не закрыта** | Полное намертвое зависание Android-приложения в разных экранах; Android emulator smoke **#151 failed**, хотя Android APK **#1572 passed**. Нельзя считать частичным лагом или доказанно исправленным. | Может затронуть C-01/05/10/15/20 и F-05/07/26/36. Перед приёмкой C/F отдельная работа по native UI thread, WebView JS heartbeat, renderer/GPU, camera lifecycle. Ссылки на аудит `docs/APP_FREEZE_AUDIT_CHECKPOINT_2026-11-05.md`. **Причина конкретного пользовательского hang не подтверждена без stack/runtime evidence**. |
| B-02 | Высокая, частично закрыта | C-05: заявлен OIS/EIS и выбор UI, но не полная доказанная применённость+стабилизация реального файла. | `StabilizationProbePlugin.java`, `stabilization-policy.ts`, `CameraPro.tsx`; добавить проверку CaptureResult vs recorded metadata, codec/stab combinations |
| B-03 | Высокая, частично закрыта | C-02/03: logical/physical matching и физический переключатель не всегда раскрываются WebView/OEM; zoom ratio может быть цифровым. | `MultiCamNativePlugin.java`, `camera-passport.ts`, `CameraPro.tsx`; разграничивать unknown/verified, проверять actual lens identity |
| B-04 | Высокая, частично закрыта | C-39/40: непрерывность записи при сворачивании/блокировке и Android foreground service/permission API не доказана во всех ветках. | `NativeCaptureService.java`, `recording-finalization.ts`, `capture-interruption.test.ts`; реальный Android lifecycle и честная маркировка interrupted |
| B-05 | Высокая, частично закрыта | F-05: fold при активной записи/Activity recreation; данные о fold/PTS есть, но непрерывная запись физически не подтверждена. | `DisplayTopologyPlugin.java`, `NativeRecordingPanel.tsx`, `NativeCaptureService.java`; автоматический end-to-end lifecycle, безопасный salvage |
| B-06 | Средняя/высокая, частично закрыта | F-17/F-23/F-24: суперузкие/круглые cover, большой шрифт и TalkBack поддержаны частично; source/DOM mocks не равны доступному UI на OEM. | `display-topology.ts`, `src/styles.css`, `fold-fullscreen-overlays.test.ts`, `accessible-dialog.test.ts`; настоящий reachable CTA/focus |
| B-07 | Высокая, частично закрыта | F-33 / C-11: лимиты сенсора/4K high-bitrate/high-speed зависят от кодека и температуры, несовместимые комбинации должны блокироваться до открытия. | `native-mode-selection.ts`, `MultiCamNativePlugin.java`, `NativeCaptureService.java`; file/encoder evidence |
| B-08 | Высокая, runtime не доказан | C-20/21/22: реальная одновременная запись и удалённое видео, достоверность peer statuses/clock sync и обрывы. | `dual-camera-verification.ts`, `mesh.ts`, `ConnectModal.tsx`, `remote-record-receipts.test.ts`; тесты не устанавливают покадровую синхронизацию |
| B-09 | Высокая, защитные проверки есть | Пользовательские видео при остановке записи, low storage, WebView/Activity loss: нельзя удалять оригинал, заменять плохой MP4 на success или выдавать манифест за готовый экспорт. | `recording-finalization.ts`, `NativeCaptureService.java`, `clip-persistence.ts`, `EditorTab.tsx`; real MP4 decode и persistent proof |
| B-10 | Средняя, контроль обязателен | После слияния в `main` в рабочей ветке C/F может отсутствовать часть новых Lovable/UI и freeze фиксов; нельзя делать слияние вслепую. | Сравнить SHA/merge-base/diff, создать совместимый новый рабочий контекст при необходимости, не переписывать или force-push в `main` |

**Диагностические гипотезы B-01 (НЕ подтверждённые единые причины):** Android `STATE_LOCK` + synchronous `SharedPreferences.commit()`; heavy `onDestroy`; sync localStorage; WebView JS event loop; Camera2 `getUserMedia` retry без истинной отмены; encoder/decoder contention; heavyweight audio decoding; graphics `nSyncAndDrawFrame`; fold resize observation cycles. Различать (a) Android main заблокирован, (b) WebView renderer завис, (c) GPU compositor, (d) OS emulator disconnect. Не ставить 100% по C/F до устранения блокирующих defects.

---

## 8. История полезных вех **только по двум ТЗ** (не копия чата)

| Дата | Работа и код | Доказательство и изменение индекса |
|---|---|---|
| 25–29.10.2026 | Ветка `chatgpt/independent-preview-20261023`: WindowManager multi-hinge/region filtering, Camera2 physical IDs/modes, WebView MediaRecorder start/stop/timeout, IDB persistence, dual independent capture, fold/MP4 evidence, фото RAW, safe lens/QR handoff. | См. `docs/IMPLEMENTATION_STATUS.md`, `docs/FOLD_AND_CAPTURE_ACCEPTANCE_MATRIX.md`. Ранние «98/99%» **не измеренная приёмка**. |
| 30–31.10.2026 | Транзакция режимов, H.264 VideoCapabilities, защиты low-storage/thermal; доступность focus и safe pane, восстановление TextureView после fold. | `docs/PROGRESS_EVIDENCE_TRACKER.md` (исторические оценки, не переносить в текущую метрику). |
| 02.11.2026 | Формальная ревизия 79 сценариев с критерием 1/0,5/0; первоначальный CI #1062 и последующие прямые тесты камеры, remote peers, складывающихся областей. | `docs/TWO_SPEC_MEASURED_PROGRESS.md`; каждая дельта подтверждена именованным CI; нет новой оценки за этот журнал. |
| 03.11.2026 | Проверка remote peer loss/record-status, USB camera/audio hotplug, ложное переключение реального объектива, переназначение preview при смене fold geometry, display recovery, editor playhead. | В `docs/TWO_SPEC_MEASURED_PROGRESS.md` детали #1187/#1209/#1243, последнее **C 39,5/43, F 27,5/36**. |
| 04–05.11.2026 | Пользователь приостановил C/F из-за системных намертвых зависаний во всех разделах, запретил отключать функциональность. | **Не считать исправления freeze приростом C/F без доказательства требований**. |
| 06.11.2026 | Две истории исходников объединены в **том же** `BauRP/project-resurrector` через PR #3; Lovable позже добавил `roadmap.md` в `main`. Документ `PROGRESS.md` создаётся в согласованной отдельной ветке, без изменения кода C/F. | `main` `56cc5f0e92ac8c87efb8d4f620d6be9e09165c68`, рабочая база `7e1f26b443cb0eb882eaf885b0753aabc388819b`. **ΔC = ΔF = ΔTOTAL = 0,00**. |

### Результаты тестов и сборок: **не переносить между SHA**

- **Измеренный индекс** основывается на `docs/TWO_SPEC_MEASURED_PROGRESS.md`, где указаны конкретные тесты и CI на дату каждого улучшения, например #1187 (60 файлов/488 тестов), #1209 (remote record-status), #1243 (522 теста/64 файла, APK/AAB); данные там проверять при дальнейшем начислении.
- **Интеграционная ветка, последняя APK:** CI «Android APK» **#1572 success** на `249a66ee...` (2026-11-06), но **emulator freeze smoke #151 failure** на том же SHA. *Появление коммита в main после этого не означает повторной успешной сборки main.*
- **На создание этого Markdown-файла** не запускались новые Android runtime tests, unit tests или APK/AAB. Это документационный коммит, **не реализация новой функции**. Для следующего кодового пакета обязательны реальные тесты+полная сборка в GitHub CI.
- Стандартный набор при наличии установленного окружения: `bun install --frozen-lockfile`; `bun run test`; `bunx tsc --noEmit` (проверить проектный `tsconfig`); `bun run build`; `bun run build:android`; затем `npx cap sync android`; `cd android && ./gradlew assembleDebug` (для release/AAB использовать **реальную** команду GitHub workflow, не выдумывать сертификаты/секреты).
- Для каждого нового сценария сначала `bun run test -- src/lib/<relevant-file>.test.ts`, затем единый большой test/build пакет. Android тест с настоящим WebView/Camera2 требует instrumentation; делать его по доступному CI, а не объявлять выполненным из Vitest.
- Документация и тесты прогресса должны отличать **passed / failed / not run**. Нельзя включать в «неоконченные задачи программной части» ручную установку APK, испытания на телефоне пользователя или аппаратуру, которой у агента нет.

---

## 9. ПРИОРИТЕТЫ И ЗАВИСИМОСТИ (строго C и F)

**В настоящее время ВСЕ эти задачи ожидают снятия паузы пользователем.** Полные hard freezes — внешний для этих двух ТЗ блокер, информация о нём хранится здесь только для безопасности.

| Очерёдность после паузы | ID | Задача и критерий | Файлы | Проверка |
|---:|---|---|---|---|
| P0 | C-05 + C-06 | Доказать реальное применение OIS/EIS из Camera2 `CaptureResult`, режим FPS, выходной MP4, отсутствие ложной метки «проверено»; не уменьшать оригинал скрытно | `StabilizationProbePlugin.java`, `stabilization-policy.ts`, `CameraPro.tsx` | Direct test + Android instrumentation при доступности; fallback unknown |
| P0 | F-05 + F-26 + F-36 | Исключить ложную «непрерывную запись» при fold/Activity recreation, проверить живые leases и MP4 PTS/сохранение | `NativeCaptureService.java`, `DisplayTopologyPlugin.java`, `NativeRecordingPanel.tsx`, `fold-recording-evidence.ts` | fold lifecycle E2E/simulated Activity instrumentation + CI; при невозможности сегментация без потери данных |
| P1 | F-17 + F-23 + F-24 + F-27 | Реальная доступность CTA/диалогов при круглом cover/очень узком окне, крупном шрифте и TalkBack | `display-topology.ts`, `MulticamApp.tsx`, `src/styles.css`, `fold-fullscreen-overlays.test.ts` | Playwright/RTL + Espresso/TalkBack по доступности; не выдумывать round-screen detection |
| P1 | C-39 + C-40 | Правдивый Android background/lock/foreground state, permissions и статус сохранённого клипа | `NativeCaptureService.java`, `recording-finalization.ts`, `capture-interruption.test.ts` | Instrumentation lifecycle, проверка ошибок и foreground notification |
| P1 | C-02 + C-03 + C-11 | Реальное сопоставление physical IDs/zoom, high-speed session, encoder combos и mode rollback | `MultiCamNativePlugin.java`, `camera-passport.ts`, `native-mode-selection.ts` | Конкретные сценарии + реальные api level guards |
| P1 | C-20 + C-21 + C-22 | Два настоящих MediaRecorder, remote peers, network loss, signed status, no fake stream/sync | `dual-camera-verification.ts`, `mesh.ts`, `ConnectModal.tsx` | Combined lifecycle tests, persisted clips, distinct camera IDs |
| P2 | F-01/06/07/09/10/12/13/14/16/18/20/33 | Компакт/внешние экраны, multi-hinge, UI каждой вкладки и 4K bitrate | `display-topology.ts`, `CameraTab.tsx`, `EditorPro.tsx`, `src/styles.css`, `NativeCaptureService.java` | Parameterized scenarios + build, platform unknown semantics |

**При блокировке:** если C-05 требует физического hardware evidence, не ставить агенту невыполнимую «установить APK на пользовательский телефон» как программный остаток. Выполнить максимум автоматических C-тестов и перейти к независимым F-17/F-23/F-24 или C-39/40. При паузе вообще не запускать C/F правки.

---

## 10. РАБОЧИЙ ПРОТОКОЛ ДЛЯ НОВОГО ЧАТА

1. Открыть **этот файл** по ветке `chatgpt/independent-preview-20261023`, прочитать сводку и разделы 5/9/11, а также `AGENTS.md`. Пользователь не обязан повторять весь контекст.
2. Запросить GitHub HEAD **обеих** веток `main` и `chatgpt/independent-preview-20261023`. Исходные значения: `main=56cc5f0e92ac8c87efb8d4f620d6be9e09165c68`, `working=7e1f26b443cb0eb882eaf885b0753aabc388819b` до журнального коммита. Сравнить `git diff <stored-SHA>..HEAD --stat` и только изменённые/смежные файлы. Если новая версия в `main` требует C/F фиксов, интегрировать без rewrite истории и без blind overwrite Lovable.
3. Проверить, существует ли всё ещё пользовательская **пауза**. Без снятия паузы не возобновлять задачи C/F.
4. Для выбранного сценария найти row C-xx/F-xx в разделе 5; открыть только перечисленные файлы и тесты, затем обязательные пункты соответствующего оригинального ТЗ.
5. Действительно исправить код, а не комментарии/мок. Не снижать функции и не удалять пользовательские видео. Группировать связанные требования в крупные пакеты, проводить конкретные unit tests, TypeScript, native APK/AAB CI, где доступно Android instrumentation.
6. После успешных подтверждений пересмотреть только затронутые C/F баллы с указанием commit+CI+изменения причины; отдельно описать аппаратную проверку без превращения её в «недоделанный код».
7. **В том же коммите/финальном коммите пакета обновить один `PROGRESS.md`**: HEAD, C/F/общий, прирост, выполненные тесты, ошибки, реальные файлы и следующую точку продолжения. Не хранить access tokens/QR secrets/личные данные.
8. Никогда не менять прежние **подтверждённые** решения молча; при конфликте первоисточник ТЗ > поздняя явно утверждённая пользователем корректировка > документация прежнего CI > неподтверждённый вывод.
9. Когда обе ТЗ *программно* завершены и все доступные проверки прошли, прямо сообщить «программная часть закончена»; аппаратные проверки пользователя вынести отдельным текстом без искусственного снижения процента программы.

---

## 11. С чего продолжить в следующем чате

**СЕЙЧАС НЕ НАЧИНАТЬ**: два ТЗ на пользовательской паузе из-за полного hard-freeze. Журнал создан без функциональных правок.

**Как только пользователь возобновит эти два ТЗ**, взять **крупный независимый пакет** с двумя направлениями:

**C-05 + C-06 (подтверждение стабилизации):**
- Открыть `src/lib/stabilization-policy.ts`, `src/lib/stabilization-policy.test.ts`, `src/components/multicam/CameraPro.tsx`, `android/app/src/main/java/app/lovable/multicampov/StabilizationProbePlugin.java`, `MultiCamNativePlugin.java`, `src/lib/camera-passport.ts`.
- В реальной Camera2/MediaRecorder архитектуре гарантировать отдельно `declared`, `requested`, `applied by CaptureResult`, `recorded/verified`; тесты на неэкспонированное OIS/EIS, несовместимый FPS и отказ CaptureResult.
- Не обещать оптическую эффективность без результата файла; ничего не выключать и не ломать в существующей записи.

**F-17 + F-23 + F-24 + F-27 (малые экраны/доступность):**
- Открыть `src/lib/display-topology.ts`, `src/lib/display-topology.test.ts`, `src/lib/fold-fullscreen-overlays.test.ts`, `src/lib/fold-modal-placement.test.ts`, `src/lib/accessible-dialog.test.ts`, `src/styles.css`, `src/components/multicam/MulticamApp.tsx`.
- Добавить настоящие DOM/layout regression tests на usable region при очень маленькой ширине/высоте, крупном text scaling, focus order, доступности основных Camera/Connect/Editor/Settings action; физическую округлость экрана признавать только при реальном API.
- Проверить сохранение timeline/playhead и навигации без scrolling jump.

**Границы работы:** не редактировать `main` вслепую; не сбрасывать `roadmap.md` Lovable; не переписывать Git историю; не замещать native Camera2 симуляцией. Если обнаружен живой критический hang, сначала обеспечить безопасность старых медиа, оформить подтверждённый блокер и перейти к независимому программному сценарию после решения пользователя.

**Команды после кодового пакета:** `bun install --frozen-lockfile` → точечные `bun run test -- src/lib/stabilization-policy.test.ts src/lib/display-topology.test.ts src/lib/fold-fullscreen-overlays.test.ts src/lib/accessible-dialog.test.ts` → `bun run test` → `bunx tsc --noEmit` → `bun run build` → Android pipeline из `.github/workflows/android_build.yml` (APK/AAB, настоящий CI). **Проверенный SHA и CI run обязательны** перед увеличением баллов.

**Ожидаемый результат первого пакета:** конкретные работающие изменения и новые воспроизводимые проверки по C-05 и F-17/F-23/F-24; обновление именно этого файла с доказанным изменением показателей (или честным Δ0,00), отдельно от физического тестирования пользователя. Не заявлять «100%» на основе красивого превью.
