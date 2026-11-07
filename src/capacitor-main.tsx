import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import "./styles.css";
import "./generated/subtitle-fonts.css";

// Apply existing native GPU-safe CSS before React constructs the first
// camera screen. Do not wait for a child component layout effect to set it.
if (Capacitor.isNativePlatform()) {
  document.documentElement.dataset["multicamNativeWebview"] = "true";
}

// Создаем роутер для клиентского режима Capacitor
const router = getRouter();

const rootElement = document.getElementById("root");

if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
