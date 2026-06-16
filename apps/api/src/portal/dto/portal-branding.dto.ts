// OrgBrandingDto — retourné par GET /portal/branding (PORT-07).
// orgId résolu depuis le JWT portail (ClientPortalGuard) — jamais cross-org.
// brandColor : hex validé /^#[0-9a-fA-F]{6}$/ côté service OrgSettingsService avant persistence.
export interface OrgBrandingDto {
  orgName: string;
  logo: string | null;
  brandColor: string | null;
}
