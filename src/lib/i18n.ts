import { useMulticamStore } from "./multicam-store";

const en = {
  camera: "Camera", editor: "Editor", settings: "Settings", connect: "Connect", connected: "Connected", devices: "devices",
  povCamera: "POV Camera", live: "LIVE", sim: "SIM", solo: "SOLO", host: "DIRECTOR", slave: "CAMERA",
  switchCamera: "Switch camera", addMarker: "Add marker", startRec: "Start recording", stopRec: "Stop recording",
  controlledByHost: "Controlled by Host", recording: "Recording", ready: "Ready",
  peak: "Peak", zebra: "Zebra", wb: "WB", iso: "ISO", track: "Track", dual: "Dual", grid: "Grid",
  gridOff: "off", gridThirds: "thirds", gridGolden: "golden", gridLevel: "level",
  shutter: "Shutter", anamorphic: "Anamorphic", lens: "Lens correction", teleprompter: "Teleprompter",
  scrollSpeed: "Scroll speed", fontSize: "Font size", holdLock: "Hold screen lock", thisDevice: "This device",
  holdHint: "Hold any pro control for help", close: "Close", battery: "Battery", storage: "Storage",
  howConnect: "How would you like to connect?", byId: "By custom number (ID)", byQr: "By QR code",
  byIdHint: "Pair using a numeric session ID", byQrHint: "Director shows a QR, cameras scan it",
  back: "Back", iAmHost: "I am the director", iAmCamera: "I am a camera", createSession: "Create session",
  sessionId: "Session ID", enterId: "Enter session ID", join: "Join", leave: "Leave session",
  idNote: "ID pairing links windows and tabs on this device instantly. For separate phones use the QR code — it works offline over Wi-Fi.",
  step1: "Step 1 · Camera scans this code", step2: "Step 2 · Scan the camera's reply code", scanReply: "Scan reply",
  addCamera: "Add another camera", showToHost: "Show this code to the director", scanHostQr: "Point at the director's QR code",
  waiting: "Waiting for connection…", generating: "Preparing code…", scanError: "Code not recognised, try again",
  cameraBlocked: "Camera access is blocked. Allow camera access to scan.", address: "Network address", peers: "Connected cameras",
  noPeers: "No cameras connected yet", latency: "Latency", pasteCode: "Or paste pairing code", apply: "Apply",
  multicamStudio: "Multicam Studio", project: "PROJECT 001", export: "Export", timeline: "timeline", color: "color", audio: "audio",
  audioSync: "Audio Sync", synced: "Synced ±1 frame", split: "Split", rippleDelete: "Ripple delete",
  speedRamp: "Speed ramp", scaleKey: "Scale keyframe", posX: "Position X", opacity: "Opacity", subtitles: "Generate offline subtitles",
  uploadLut: "Upload .cube LUT", chroma: "Chroma key", tolerance: "Key tolerance", smoothness: "Edge smoothness",
  autoMatch: "Auto-color match 3 cameras", deEsser: "De-Esser", autoGain: "Auto Gain · -14 LUFS", noise: "Noise reduction",
  deliver: "DELIVER", exportProject: "Export project", aspect: "Aspect", resolution: "Resolution", fps: "FPS",
  videoCodec: "Video codec", audioCodec: "Audio codec", sampleRate: "Sample rate", bitrate: "Bitrate", audioBr: "Audio",
  localRender: "Local render", renderOffline: "Render offline",
  meshNodes: "P2P mesh", runTest: "Run test", testing: "Testing…", offlineCache: "Offline cache", hwAccel: "Hardware acceleration",
  hwAccelSub: "WebCodecs / GPU where available", resetProject: "Reset current project", legal: "LEGAL", status: "STATUS", bandwidth: "BANDWIDTH",
};
type Dict = typeof en;

const ru: Dict = {
  camera: "Камера", editor: "Редактор", settings: "Настройки", connect: "Подключить", connected: "Подключено", devices: "устр.",
  povCamera: "POV Камера", live: "ЭФИР", sim: "СИМ", solo: "СОЛО", host: "РЕЖИССЁР", slave: "КАМЕРА",
  switchCamera: "Сменить камеру", addMarker: "Добавить маркер", startRec: "Начать запись", stopRec: "Остановить запись",
  controlledByHost: "Управляется режиссёром", recording: "Запись", ready: "Готово",
  peak: "Пикинг", zebra: "Зебра", wb: "ББ", iso: "ISO", track: "Трекинг", dual: "Две камеры", grid: "Сетка",
  gridOff: "выкл", gridThirds: "трети", gridGolden: "золотое", gridLevel: "уровень",
  shutter: "Выдержка", anamorphic: "Анаморф", lens: "Коррекция объектива", teleprompter: "Телесуфлёр",
  scrollSpeed: "Скорость прокрутки", fontSize: "Размер шрифта", holdLock: "Удерживать блокировку экрана", thisDevice: "Это устройство",
  holdHint: "Удерживайте профи-кнопку для подсказки", close: "Закрыть", battery: "Батарея", storage: "Память",
  howConnect: "Как вы хотите подключиться?", byId: "По индивидуальному номеру (ID)", byQr: "По QR-коду",
  byIdHint: "Сопряжение по числовому ID сессии", byQrHint: "Режиссёр показывает QR, камеры сканируют",
  back: "Назад", iAmHost: "Я режиссёр", iAmCamera: "Я камера", createSession: "Создать сессию",
  sessionId: "ID сессии", enterId: "Введите ID сессии", join: "Подключиться", leave: "Выйти из сессии",
  idNote: "Подключение по ID мгновенно связывает окна и вкладки на этом устройстве. Для разных телефонов используйте QR-код — он работает без интернета через Wi‑Fi.",
  step1: "Шаг 1 · Камера сканирует этот код", step2: "Шаг 2 · Отсканируйте ответный код камеры", scanReply: "Сканировать ответ",
  addCamera: "Добавить ещё камеру", showToHost: "Покажите этот код режиссёру", scanHostQr: "Наведите на QR-код режиссёра",
  waiting: "Ожидание подключения…", generating: "Подготовка кода…", scanError: "Код не распознан, попробуйте ещё раз",
  cameraBlocked: "Доступ к камере запрещён. Разрешите доступ для сканирования.", address: "Сетевой адрес", peers: "Подключённые камеры",
  noPeers: "Камеры пока не подключены", latency: "Задержка", pasteCode: "Или вставьте код сопряжения", apply: "Применить",
  multicamStudio: "Мультикам студия", project: "ПРОЕКТ 001", export: "Экспорт", timeline: "таймлайн", color: "цвет", audio: "звук",
  audioSync: "Синхр. по звуку", synced: "Синхронизировано ±1 кадр", split: "Разрезать", rippleDelete: "Удалить со сдвигом",
  speedRamp: "Изменение скорости", scaleKey: "Масштаб (ключ)", posX: "Позиция X", opacity: "Прозрачность", subtitles: "Создать офлайн-субтитры",
  uploadLut: "Загрузить LUT .cube", chroma: "Хромакей", tolerance: "Допуск ключа", smoothness: "Сглаживание краёв",
  autoMatch: "Автоподбор цвета 3 камер", deEsser: "Де-эссер", autoGain: "Автоусиление · -14 LUFS", noise: "Шумоподавление",
  deliver: "ВЫВОД", exportProject: "Экспорт проекта", aspect: "Формат", resolution: "Разрешение", fps: "Кадр/с",
  videoCodec: "Видеокодек", audioCodec: "Аудиокодек", sampleRate: "Частота", bitrate: "Битрейт", audioBr: "Аудио",
  localRender: "Локальный рендер", renderOffline: "Рендер офлайн",
  meshNodes: "P2P-сеть", runTest: "Тест", testing: "Проверка…", offlineCache: "Офлайн-кэш", hwAccel: "Аппаратное ускорение",
  hwAccelSub: "WebCodecs / GPU, если доступно", resetProject: "Сбросить текущий проект", legal: "ПРАВОВОЕ", status: "СТАТУС", bandwidth: "СКОРОСТЬ",
};

export type TipKey = "focusPeaking" | "zebras" | "wbLock" | "isoLock" | "shutter" | "anamorphic" | "distortion";
const tipsEn: Record<TipKey, [string, string]> = {
  focusPeaking: ["Focus peaking", "Paints sharp edges neon green. Turn the focus until your subject glows — that part of the image is in focus."],
  zebras: ["Zebra stripes", "Draws diagonal stripes over overexposed areas. If you see stripes on a face, lower brightness or exposure."],
  wbLock: ["White balance lock", "Freezes colour temperature so skin tones do not shift between shots. Lock it after framing under your final light."],
  isoLock: ["ISO lock", "Keeps sensor sensitivity fixed so brightness doesn't pump. Lower ISO means less noise; lock it once exposure looks right."],
  shutter: ["Shutter speed", "How long each frame is exposed. Use double your frame rate (1/48 at 24fps) for natural motion blur."],
  anamorphic: ["Anamorphic de-squeeze", "Stretches the picture back to normal when shooting with an anamorphic lens adapter. Pick your adapter's factor."],
  distortion: ["Lens correction", "Straightens lines bent by wide or fisheye lenses. Move the slider until walls and horizons look straight."],
};
const tipsRu: Record<TipKey, [string, string]> = {
  focusPeaking: ["Фокус-пикинг", "Подсвечивает резкие края неоново-зелёным. Крутите фокус, пока объект не засветится — эта часть кадра в фокусе."],
  zebras: ["Зебра", "Рисует диагональные полосы на пересвеченных участках. Если полосы на лице — уменьшите яркость или экспозицию."],
  wbLock: ["Блокировка баланса белого", "Фиксирует цветовую температуру, чтобы оттенок кожи не менялся между дублями. Блокируйте после настройки под итоговый свет."],
  isoLock: ["Блокировка ISO", "Фиксирует чувствительность матрицы, чтобы яркость не «прыгала». Чем ниже ISO, тем меньше шума; блокируйте, когда экспозиция в норме."],
  shutter: ["Выдержка", "Время экспонирования каждого кадра. Используйте удвоенную частоту кадров (1/48 при 24 к/с) для естественного размытия движения."],
  anamorphic: ["Анаморфный десквиз", "Растягивает изображение до нормальных пропорций при съёмке с анаморфной насадкой. Выберите коэффициент своей насадки."],
  distortion: ["Коррекция объектива", "Выпрямляет линии, искривлённые широкоугольным объективом или «рыбьим глазом». Двигайте ползунок, пока стены и горизонт не станут прямыми."],
};

export function useT() {
  const language = useMulticamStore((s) => s.language);
  const dict: Dict = language === "ru" ? ru : en;
  const tips = language === "ru" ? tipsRu : tipsEn;
  return { t: (key: keyof Dict) => dict[key], tip: (key: TipKey) => tips[key], language };
}
