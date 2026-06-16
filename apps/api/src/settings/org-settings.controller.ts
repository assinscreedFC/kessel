import { Body, Controller, Get, Inject, Patch } from "@nestjs/common";
import { OrgRoles, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { requireOrg } from "../shared/require-org";
import { OrgSettingsService, type OrgSettingsDto } from "./org-settings.service";
import { UpdateOrgSettingsDto } from "./dto/update-org-settings.dto";

// GET + PATCH /api/orgs/me/settings — configuration TVA + locale de l'org (TVA-01, I18N-01).
//
// RBAC :
//   - GET  : accessible à tous les membres (lecture seule).
//   - PATCH : @OrgRoles(["owner"]) — member → 403 (T-7-03 STRIDE Elevation of Privilege).
//
// Scoping ORM : toutes les opérations passent par forOrg(orgId) via OrgSettingsService,
// où orgId = requireOrg(session) = activeOrganizationId canonique Better Auth.
@Controller("api/orgs/me/settings")
export class OrgSettingsController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes -> token DI requis.
  constructor(@Inject(OrgSettingsService) private readonly svc: OrgSettingsService) {}

  @Get()
  async getSettings(
    @Session() session: UserSession<typeof auth>,
  ): Promise<OrgSettingsDto> {
    return this.svc.getOrgSettings(requireOrg(session));
  }

  @OrgRoles(["owner"])
  @Patch()
  async updateSettings(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: UpdateOrgSettingsDto,
  ): Promise<OrgSettingsDto> {
    return this.svc.updateOrgSettings(requireOrg(session), dto);
  }
}
