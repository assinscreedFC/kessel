import { useTranslation } from "react-i18next";

// useLang — switcher de langue dashboard (I18N-01).
// Persiste dans localStorage("kessel_lang") + PATCH fire-and-forget sur /api/orgs/me/settings
// pour synchroniser defaultLocale côté serveur (T-7-14 : champ disabled viewer côté UI, 403 côté serveur).
// L'échec du PATCH est silencieux — localStorage est la source de vérité pour la session courante.

export function useLang() {
  const { i18n } = useTranslation();

  const switchLang = (lang: "fr" | "en") => {
    i18n.changeLanguage(lang);
    localStorage.setItem("kessel_lang", lang);
    fetch("/api/orgs/me/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultLocale: lang }),
    }).catch(() => {
      // Fire-and-forget — PATCH failure is silently ignored (localStorage is authoritative for session).
    });
  };

  return { lang: i18n.language as "fr" | "en", switchLang };
}
