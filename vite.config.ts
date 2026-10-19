import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    ssr: false, // Отключаем SSR для генерации чистого SPA под Android
  },
  vite: {
    build: {
      outDir: ".output/public", // Принудительно заставляем Vite/Nitro выплевывать билд прямо в .output/public
      emptyOutDir: true,
    },
  },
});
