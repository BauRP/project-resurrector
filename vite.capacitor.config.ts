import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ],
  build: {
    // Android 9 emulator can ship Chromium WebView 69. The default Vite 8
    // browser target leaves optional chaining in shipped JS and fails before
    // React can mount the bottom navigation. Build the actual APK for Chrome 69.
    target: "chrome69",
    cssTarget: "chrome69",
    outDir: ".output/public",
    emptyOutDir: true,
  },
});
