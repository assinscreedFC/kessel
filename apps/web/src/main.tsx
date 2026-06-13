import "./i18n";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/app/app";
import "@/app/styles.css";

// Point d'entrée Vite. Monte l'app shell FSD dans #root. Scaffold Plan 05 — pas de routeur
// ni de feature métier (ajoutés aux phases suivantes via la couche `pages`).
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root introuvable dans index.html");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
