import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    ssr: false, // Отключаем SSR для генерации чистого SPA под Android
  },
  vite: {
    // ВАЖНО: относительные пути к ассетам — чтобы работало и с https://localhost (Capacitor),
    // и с любым сгенерированным index.html (включая fallback-загрузчик в workflow)
    base: "./",
    // УБРАНО: build.outDir — Nitro и так выводит клиентский билд в .output/public.
    // Переопределение ломало раскладку ассетов и было причиной "потерянного" index.html.
  },
});
