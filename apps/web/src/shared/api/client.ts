// Client API typé du web — couche `shared/api` de la FSD.
//
// Toutes les requêtes ciblent `/api${path}` :
// - en dev, le proxy Vite (vite.config.ts) renvoie `/api` -> http://localhost:3000 (l'api NestJS) ;
// - en prod, Caddy sert `/api/*` (même origine, pas de CORS).
// `credentials: "include"` envoie le cookie de session Better Auth (autorisation prouvée serveur).
// Le web ne stocke AUCUN token (cookie httpOnly) — défense XSS par défaut.

type QueryParams = Record<string, string>;

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  query?: QueryParams,
): Promise<T> {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  const res = await fetch(`/api${path}${qs}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }

  // 204 No Content : pas de corps à parser.
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  get: <T>(path: string, query?: QueryParams): Promise<T> =>
    request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>("PATCH", path, body),
  del: <T>(path: string): Promise<T> => request<T>("DELETE", path),
};
