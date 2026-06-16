import { LinkIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePortalLang } from "@/shared/lib/use-portal-lang";

// Screen 3 — Écran 401 uniforme (anti-énumération T-4-ui-enum).
// Même message exact pour token inconnu, expiré, ou déjà consommé.
// Aucun bouton retry, aucun input. Focus initial sur h1 (accessibilité).
export function Error401Page() {
  const { t } = useTranslation();
  const { lang, switchPortalLang } = usePortalLang();

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <LinkIcon className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
        <h1
          className="mt-4 text-xl font-semibold tracking-tight text-slate-900"
          tabIndex={-1}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        >
          {t("portal.error_401.title")}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {t("portal.error_401.body")}
        </p>
        <footer className="mt-8 text-xs text-slate-500">
          <p>{t("portal.footer")}</p>

          {/* Toggle FR/EN — Surface 4 (07-UI-SPEC) */}
          <div className="mt-4 flex justify-center gap-3 text-xs text-slate-500">
            <button
              aria-pressed={lang === "fr"}
              className={`underline-offset-2 ${lang === "fr" ? "font-semibold text-slate-900 underline" : "hover:underline"}`}
              onClick={() => switchPortalLang("fr")}
            >
              {t("portal.lang_toggle.fr")}
            </button>
            <span aria-hidden="true">·</span>
            <button
              aria-pressed={lang === "en"}
              className={`underline-offset-2 ${lang === "en" ? "font-semibold text-slate-900 underline" : "hover:underline"}`}
              onClick={() => switchPortalLang("en")}
            >
              {t("portal.lang_toggle.en")}
            </button>
          </div>
        </footer>
      </main>
    </div>
  );
}
