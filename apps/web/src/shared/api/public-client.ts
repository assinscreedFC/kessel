// Client API PUBLIC dédié — couche `shared/api` de la FSD, pour la SEULE surface publique /p/:token.
//
// GARDE-FOU DE SÉCURITÉ (T-5-web-iso, isolation FOUND-05) : ce client NE DOIT JAMAIS envoyer les
// cookies du dashboard. La page publique ne porte AUCUNE permission — c'est le token dans l'URL qui
// est le secret d'accès, pas une session. On force donc `credentials: "omit"` partout (y compris
// getBlob pour le download PDF), à l'opposé du client authentifié (shared/api/client.ts) qui, lui,
// joint le cookie de session.
//
// Toutes les requêtes ciblent `/api/public/...` : en dev le proxy Vite renvoie /api -> :3000 ;
// en prod Caddy sert /api/* (même origine, catch-all SPA pour /p/*). Aucun changement Caddy requis.

// Erreur HTTP typée : porte le code statut pour que l'UI distingue 404 (token invalide ->
// état invalid-token, anti-énumération) de 503 (cert signature absent) ou d'un échec générique,
// sans parser de message serveur (pas de leak).
export class PublicApiError extends Error {
  constructor(readonly status: number) {
    super(`PublicAPI ${status}`);
    this.name = "PublicApiError";
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    // JAMAIS les cookies du dashboard sur la surface publique (garde-fou isolation).
    credentials: "omit",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new PublicApiError(res.status);
  }

  // 204 No Content (POST /view) : pas de corps à parser.
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// Download binaire PUBLIC (PDF non signé ou signé) — SANS cookie. Lève PublicApiError(404) si
// l'endpoint répond 404 (token invalide / PDF signé pas encore disponible) pour ne JAMAIS
// télécharger une page d'erreur déguisée en .pdf.
async function getBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, { method: "GET", credentials: "omit" });
  if (!res.ok) {
    throw new PublicApiError(res.status);
  }
  return res.blob();
}

export const publicApi = {
  get: <T>(path: string): Promise<T> => request<T>("GET", path),
  post: <T>(path: string, body?: unknown): Promise<T> => request<T>("POST", path, body),
  getBlob,
};
