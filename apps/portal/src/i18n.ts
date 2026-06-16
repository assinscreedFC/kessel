import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import frPortal from "./locales/fr.json";
import enPortal from "./locales/en.json";

// Détecte la langue depuis localStorage (portal_lang) puis navigator.language.
// Valeurs acceptées : "fr" | "en" uniquement (guard explicite — T-7-11).
function detectLang(): "fr" | "en" {
  const stored = localStorage.getItem("portal_lang");
  if (stored === "fr" || stored === "en") return stored;
  if (navigator.language.startsWith("en")) return "en";
  return "fr";
}

i18n.use(initReactI18next).init({
  lng: detectLang(),
  fallbackLng: "fr",
  resources: {
    fr: { translation: frPortal },
    en: { translation: enPortal },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
