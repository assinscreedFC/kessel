import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/shared/ui/skeleton";
import { portalApi } from "@/shared/lib/api";
import { Error401Page } from "@/pages/error-401/ui/error-401-page";

// Screen 1 — Magic-link exchange (/?token=<token>).
// Exchange automatique au mount : lit le token depuis l'URL, appelle POST /portal/auth/exchange.
// Succès → redirect /dashboard (cookie httpOnly posé).
// Échec ou token absent → affiche l'écran 401 uniforme in-place (pas de redirect).
// État loading : Skeleton card animate-pulse. JAMAIS de spinner.
export function MagicLinkPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "error">("loading");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");

    if (!token) {
      setState("error");
      return;
    }

    portalApi
      .exchange(token)
      .then((res) => {
        if (res.ok) {
          navigate("/dashboard", { replace: true });
        } else {
          setState("error");
        }
      })
      .catch(() => {
        setState("error");
      });
    // Only runs on mount — no deps needed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "error") {
    return <Error401Page />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-md px-4 py-16">
        <div
          className="rounded-lg border border-slate-200 bg-white p-6"
          role="status"
          aria-label="Vérification en cours…"
        >
          <Skeleton className="h-5 w-40" aria-hidden="true" />
          <Skeleton className="mt-4 h-4 w-64" aria-hidden="true" />
          <Skeleton className="mt-6 h-11 w-full" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
