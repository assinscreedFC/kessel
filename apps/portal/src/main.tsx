import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/app";
import "@/app/styles.css";

// Point d'entrée Vite portail. Pas d'i18n (livré Phase 7).
const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root introuvable dans index.html");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
