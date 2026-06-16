import { useEffect, useState } from "react";

// useSessionRole — détecte le rôle de l'utilisateur dans l'org active via Better Auth.
//
// Stratégie :
//  GET /api/auth/get-session (credentials:include) → session.session.activeOrganizationId présent
//  si l'utilisateur est dans une org. On appelle ensuite GET /api/auth/get-active-organization-member
//  ou on lit session.member.role si Better Auth l'expose dans la session étendue.
//
//  Note de sécurité (T-5-ui-viewer) :
//   Ce hook sert UNIQUEMENT pour l'UX (cacher/désactiver les boutons write).
//   L'autorité canonique est le RolesGuard côté serveur (plan 05-05) qui renvoie 403 sur toute
//   requête d'écriture d'un viewer. Si ce hook retourne isViewer=false par erreur (fail-open),
//   le serveur protège quand même la ressource. Le fail-open est intentionnel ici — on préfère
//   montrer un bouton inutile à masquer une fonction légitime pour un non-viewer.

interface SessionShape {
  session?: {
    activeOrganizationId?: string | null;
  };
  member?: {
    role?: string;
  };
  user?: {
    id: string;
  };
}

export interface SessionRole {
  isViewer: boolean;
  isLoading: boolean;
}

export function useSessionRole(): SessionRole {
  const [isViewer, setIsViewer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchRole() {
      try {
        const res = await fetch("/api/auth/get-session", {
          credentials: "include",
        });

        if (!res.ok) {
          // Pas de session — fail-open (pas viewer par défaut).
          if (!cancelled) {
            setIsViewer(false);
            setIsLoading(false);
          }
          return;
        }

        const data = (await res.json()) as SessionShape;

        // Better Auth 1.6.18 expose le rôle membre dans session.member.role quand l'org est active.
        // Si le champ n'est pas présent (ancienne version ou org inactive), on default à false.
        const role = data?.member?.role;
        if (!cancelled) {
          setIsViewer(role === "viewer");
          setIsLoading(false);
        }
      } catch {
        // Erreur réseau — fail-open.
        if (!cancelled) {
          setIsViewer(false);
          setIsLoading(false);
        }
      }
    }

    void fetchRole();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isViewer, isLoading };
}
