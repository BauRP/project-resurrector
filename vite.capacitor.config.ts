import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    ssr: false, // Отключаем SSR для работы в мобильном WebView
  },
  vite: {
    base: "./", // Обязательно для относительных путей в Android APK
    build: {
      outDir: ".output/public",
      emptyOutDir: true,
    },
  },
});
