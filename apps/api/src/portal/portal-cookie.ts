// Helpers cookie portail client (PORT-01).
// HttpOnly + SameSite=Strict => T-4-cookie-xss + T-4-csrf mitigés.
// Secure en production seulement (localhost n'a pas HTTPS).

const COOKIE_NAME = "portal_session";
const MAX_AGE_SEC = 7 * 24 * 3600; // 7 jours

/**
 * Construit la valeur du header Set-Cookie pour le JWT portail.
 * HttpOnly : inaccessible JS (T-4-cookie-xss).
 * SameSite=Strict : csrf protection (T-4-csrf).
 * Secure : uniquement en production (HTTPS).
 */
export function buildPortalCookie(jwt: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${jwt}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${MAX_AGE_SEC}${secure}`;
}

/**
 * Extrait la valeur du cookie portal_session depuis les headers de la requête.
 * Retourne undefined si absent.
 */
export function extractPortalCookie(req: { headers: { cookie?: string } }): string | undefined {
  const raw = req.headers.cookie ?? "";
  const match = raw.match(/(?:^|;\s*)portal_session=([^;]+)/);
  return match?.[1];
}
