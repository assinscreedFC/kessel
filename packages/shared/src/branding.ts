// Branding partagé (PORT-07) — source de vérité unique front/back (anti-drift).
// DTO retourné par GET /portal/branding + validation couleur hex (T-8-css anti CSS injection).

export interface OrgBrandingDto {
  orgName: string;
  logo: string | null;
  brandColor: string | null;
}

// Couleur de marque par défaut (fallback header portail + formulaire branding).
export const DEFAULT_BRAND_COLOR = "#4F46E5";

// Format hex #RRGGBB obligatoire — seul format accepté avant persistence ET avant injection <style>.
export const BRAND_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

// Validation couleur de marque : true uniquement si hex #RRGGBB (anti CSS injection, T-8-css).
export function isValidBrandColor(value: string): boolean {
  return BRAND_COLOR_RE.test(value);
}
