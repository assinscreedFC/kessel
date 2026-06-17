// OrgBrandingDto — retourné par GET /portal/branding (PORT-07).
// orgId résolu depuis le JWT portail (ClientPortalGuard) — jamais cross-org.
// brandColor : hex validé (isValidBrandColor) côté OrgSettingsService avant persistence.
// Source de vérité unique : @kessel/shared (anti-drift front/back).
export type { OrgBrandingDto } from "@kessel/shared";
