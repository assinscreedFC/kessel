// Client API typé du web — couche `shared/api` de la FSD.
//
// Toutes les requêtes ciblent `/api${path}` :
// - en dev, le proxy Vite (vite.config.ts) renvoie `/api` -> http://localhost:3000 (l'api NestJS) ;
// - en prod, Caddy sert `/api/*` (même origine, pas de CORS).
// `credentials: "include"` envoie le cookie de session Better Auth (autorisation prouvée serveur).
// Le web ne stocke AUCUN token (cookie httpOnly) — défense XSS par défaut.

type QueryParams = Record<string, string>;

// Erreur HTTP typée : porte le code statut pour que l'UI distingue les classes d'échec sans parser
// un message (ex. 503 = feature désactivée vs 4xx/5xx = échec générique — moteur IA Plan 04-03).
// Le message reste `API ${status}` (rétro-compatible avec les `Error` attrapés génériquement).
export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  query?: QueryParams,
  signal?: AbortSignal,
): Promise<T> {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const res = await fetch(`/api${path}${qs}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    throw new ApiError(res.status);
  }

  // 204 No Content : pas de corps à parser.
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

// GET binaire (export PDF) : récupère un Blob via la même session (credentials:include). Aucun token
// en localStorage — le download PDF passe par le cookie httpOnly (T-3-web-auth).
async function getBlob(path: string): Promise<Blob> {
  const res = await fetch(`/api${path}`, { method: "GET", credentials: "include" });
  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string, query?: QueryParams): Promise<T> =>
    request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> =>
    request<T>("POST", path, body, undefined, signal),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>("PATCH", path, body),
  del: <T>(path: string): Promise<T> => request<T>("DELETE", path),
  getBlob,
};
