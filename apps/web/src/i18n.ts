import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Infra i18n front (Phase 1) — catalogues vides FR/EN, lng "fr" par défaut. t('missing.key') retourne
// 'missing.key' (keyAsDefaultValue par défaut react-i18next) -> aucune régression, aucun flash.
// Importé en TÊTE de main.tsx (avant le render) pour être initialisé avant tout composant (Pitfall 5).
// La bascule de langue + détection navigateur arrivent Phase 7 (I18N-01/02).
i18n.use(initReactI18next).init({
  lng: "fr",
  fallbackLng: "fr",
  resources: { fr: { translation: {} }, en: { translation: {} } },
  interpolation: { escapeValue: false },
});

export default i18n;
