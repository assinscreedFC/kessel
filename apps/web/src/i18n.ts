import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import frTranslation from "./locales/fr.json";
import enTranslation from "./locales/en.json";

// i18n web (Phase 7 — I18N-01). Catalogues FR/EN chargés depuis locales/*.json.
// Langue initiale : localStorage("kessel_lang") → "fr" par défaut (Pitfall 5 : initialisé avant
// le premier render dans main.tsx).
// La bascule live se fait via useLang().switchLang() — changeLanguage + localStorage + PATCH.

const savedLang = localStorage.getItem("kessel_lang");
const initialLang = savedLang === "fr" || savedLang === "en" ? savedLang : "fr";

i18n.use(initReactI18next).init({
  lng: initialLang,
  fallbackLng: "fr",
  resources: {
    fr: { translation: frTranslation },
    en: { translation: enTranslation },
  },
  interpolation: { escapeValue: false },
});

export default i18n;
