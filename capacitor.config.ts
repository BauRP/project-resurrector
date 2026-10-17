import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.multicampov",
  appName: "MULTI-CAM POV",
  webDir: ".output/public",
  server: {
    androidScheme: "https",
    cleartext: true
  }
};

export default config;
