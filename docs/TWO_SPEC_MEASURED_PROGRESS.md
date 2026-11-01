# Индекс подтверждённого программного покрытия обоих ТЗ

Дата первоначального расчёта: 2 ноября 2026. Рабочая ветка `chatgpt/independent-preview-20261023`, база CI #1062 успешна.

### Правила
Этот **индекс аудита**, а не доказательство всей функциональной готовности или аппаратной совместимости. Он измеряет текущее подтверждённое автоматикой покрытие **79 сценариев** и служит стабильной шкалой для следующих этапов. Каждый сценарий имеет равный вес.

- **1,0** — обнаружен прямой исполняемый автоматический тест основной программной логики сценария; тест работает в успешном CI. При этом не все ветви требования обязательно закрыты.
- **0,5** — код и смежные проверки присутствуют, но полная программная проверка сценария не продемонстрирована.
- **0,0** — достаточная конкретная программная проверка пока не обнаружена.

Важное ограничение: наличие теста не устанавливает корректность всех возможностей телефона. Для **завершения ТЗ на 100%** необходимо не просто набрать все единицы, но отдельно подтвердить полное программное end-to-end закрытие каждого пункта и итоговый CI. Реальные устройства проверяются позже по решению владельца.

Старые оценки 99,450% / 99,9985% были несопоставимыми приблизительными суждениями; **новая шкала заменяет их**, прирост с момента создания базы = 0,00 п.п. Следующее обновление считает дельту от этой базы, а не от исторических цифр.

### Камеры — 36/43 = 83.72%
Подтверждено: 30; частично: 12; без конкретных проверок: 1.

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
| C-15 | Фон/возврат | 0.5 | `src/lib/capture-interruption.test.ts` |
| C-16 | Мало места | 1.0 | `src/lib/diagnostic-safety.test.ts` |
| C-17 | Перегрев | 1.0 | `src/lib/diagnostic-safety.test.ts` |
| C-18 | Внешний микрофон | 0.5 | `src/lib/recording-finalization.test.ts` |
| C-19 | Прерывание звука | 1.0 | `src/lib/recording-finalization.test.ts` |
| C-20 | Две камеры | 1.0 | `src/lib/dual-live-recording-lifecycle.test.ts` |
| C-21 | Несколько телефонов | 0.0 | — |
| C-22 | Обрыв сети | 0.5 | `src/lib/mesh-connection-loss.test.ts` |
| C-23 | Отмена теста | 1.0 | `src/lib/mode-verification.test.ts` |
| C-24 | Старый ответ | 1.0 | `src/lib/camera-passport.test.ts` |
| C-25 | Обновление | 1.0 | `src/lib/camera-passport.test.ts` |
| C-26 | Паспорт | 1.0 | `src/lib/camera-passport.test.ts` |
| C-27 | MP4 проверка | 1.0 | `src/lib/clip-persistence.test.ts` |
| C-28 | Восстановление | 1.0 | `src/lib/capture-interruption.test.ts` |
| C-29 | Внешняя камера исчезает | 0.5 | `src/lib/camera-test-queue.test.ts` |
| C-30 | Временная занятость | 1.0 | `src/lib/camera-test-queue.test.ts` |
| C-31 | devicechange | 0.5 | `src/lib/camera-test-queue.test.ts` |
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

### Раскладушки — 24.5/36 = 68.06%
Подтверждено: 16; частично: 17; без конкретных проверок: 3.

| ID | Сценарий | Балл | Кодовая проверка |
|---|---|---:|---|
| F-01 | Book закрыт | 0.5 | `src/lib/display-topology.test.ts` |
| F-02 | Book открыт | 1.0 | `src/lib/display-topology.test.ts` |
| F-03 | Повторный fold | 1.0 | `src/lib/fold-recording-evidence.test.ts` |
| F-04 | Предпросмотр при fold | 0.5 | `src/lib/native-preview-lifecycle-contract.test.ts` |
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
| F-17 | Круглый экран | 0.0 | — |
| F-18 | Outward fold | 0.5 | `src/lib/display-topology.test.ts` |
| F-19 | Два экрана | 1.0 | `src/lib/display-topology.test.ts` |
| F-20 | Поворот | 0.5 | `src/lib/display-topology.test.ts` |
| F-21 | Resize | 1.0 | `src/lib/display-topology.test.ts` |
| F-22 | Клавиатура | 1.0 | `src/lib/display-topology.test.ts` |
| F-23 | Крупный шрифт | 0.0 | — |
| F-24 | TalkBack | 0.0 | — |
| F-25 | Touch focus resize | 1.0 | `src/lib/camera-controller.test.ts` |
| F-26 | Таймер через fold | 1.0 | `src/lib/recording-duration.test.ts` |
| F-27 | Без горизонтального overflow | 0.5 | `src/lib/fold-modal-placement.test.ts` |
| F-28 | Контролы и hinge | 1.0 | `src/lib/native-preview-placement.test.ts` |
| F-29 | Не прыгает к началу | 0.5 | `src/lib/fold-ui-recovery.test.ts` |
| F-30 | Нет выдуманных возможностей | 1.0 | `src/lib/fold-recording-evidence.test.ts` |
| F-31 | Обрыв mic 1 | 1.0 | `src/lib/recording-finalization.test.ts` |
| F-32 | Обрыв mic 2 | 1.0 | `src/lib/dual-live-recording-lifecycle.test.ts` |
| F-33 | 4K bitrate | 0.5 | `src/lib/native-audit-persistence-contract.test.ts` |
| F-34 | MP4 PTS rollback | 1.0 | `src/lib/native-recorded-mode-evidence.test.ts` |
| F-35 | Редактор курсор | 0.5 | `src/lib/editor-project-recovery.test.ts` |
| F-36 | Activity recreation | 1.0 | `src/lib/fold-ui-recovery.test.ts` |

### Общий индекс — 76.58%
Формула: (36 + 24.5) / 79 × 100%. Это взвешенное значение, учитывающее разное количество требований.

Приоритет следующего аудита: C-21/C-22, C-05, F-17/F-23/F-24, C-20 и F-05/F-26. Редактировать баллы по исходным сценариям только с конкретной ссылкой на код/тест и успешной сборкой; при обнаружении нового дефекта снижать оценку, а не имитировать рост.

## Изменение №1 после базовой оценки — 2 ноября 2026
- C-22 «Обрыв сети»: `0.0 → 0.5`, после `mesh-connection-loss.test.ts`: авария отправки WebRTC DataChannel больше не рушит управление; позднее закрытие старого канала не удаляет уже переподключившуюся камеру. Это частичная программная проверка: настоящая межтелефонная потеря связи не проверена.
- Коммит `7af297c0`, успешный CI #1066 (`41350536443`), APK/AAB собраны.
- **Камеры 82,56% → 83,72% (+1,16 п.п.)**; **раскладушки 68,06% → 68,06% (+0,00 п.п.)**; **взвешенная общая оценка 75,95% → 76,58% (+0,63 п.п.)**.
- Исправление фокусировки на растянутом CSS-превью: `c5db8ea2`, `01e1c68b`, успешный CI #1064. Пункт F-25 уже учитывал тест, поэтому дополнительные баллы не присвоены.
- Проценты описывают **индекс подтверждённого программного покрытия**, не сертифицированную полную готовность. Все 79 сценариев требуют окончательной end-to-end сверки до 100%.
