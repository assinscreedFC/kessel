import { useTranslation } from "react-i18next";
import i18n from "@/i18n";

// Hook exposant la langue active du portail et la fonction de bascule.
// switchPortalLang est un event handler uniquement — pas de useEffect changeLanguage (Pitfall 5).
// localStorage.setItem("portal_lang", lang) persiste le choix entre sessions.
export function usePortalLang(): {
  lang: "fr" | "en";
  switchPortalLang: (lang: "fr" | "en") => void;
} {
  const { i18n: i18nInstance } = useTranslation();

  const lang = (i18nInstance.language === "en" ? "en" : "fr") as "fr" | "en";

  function switchPortalLang(newLang: "fr" | "en"): void {
    void i18n.changeLanguage(newLang);
    localStorage.setItem("portal_lang", newLang);
  }

  return { lang, switchPortalLang };
}
