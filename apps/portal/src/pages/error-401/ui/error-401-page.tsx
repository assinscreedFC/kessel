import { LinkIcon } from "lucide-react";

// Screen 3 — Écran 401 uniforme (anti-énumération T-4-ui-enum).
// Même message exact pour token inconnu, expiré, ou déjà consommé.
// Aucun bouton retry, aucun input. Focus initial sur h1 (accessibilité).
export function Error401Page() {
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
          Lien indisponible
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Ce lien n&apos;est plus valide ou a expiré. Contactez votre interlocuteur pour obtenir un nouveau lien.
        </p>
        <footer className="mt-8 text-xs text-slate-500">
          <p>Propulsé par Kessel</p>
        </footer>
      </main>
    </div>
  );
}
