import { Controller, HttpCode, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { OrgScopeGuard } from "../auth/org-scope.guard";
import { requireOrg } from "../shared/require-org";
import { PortalAuthService } from "./portal-auth.service";

// POST /api/portal/issue/:contactId — endpoint AGENCE pour émettre un magic link portail.
//
// Sécurité :
//  - @UseGuards(OrgScopeGuard) : s'assure qu'une org active est dans la session Better Auth.
//  - requireOrg(session) : extrait l'orgId canonique (source unique Better Auth).
//  - issueMagicLink vérifie que contactId appartient à l'org (anti-IDOR T-4-idor).
//  - 404 si le contact n'appartient pas à l'org (pas de distinguo sur l'existence).

@Controller("api/portal")
@UseGuards(OrgScopeGuard)
export class PortalIssueController {
  constructor(@Inject(PortalAuthService) private readonly portalAuth: PortalAuthService) {}

  @Post("issue/:contactId")
  @HttpCode(201)
  async issue(
    @Param("contactId") contactId: string,
    @Session() session: UserSession<typeof auth>,
  ): Promise<{ link: string }> {
    const orgId = requireOrg(session);
    return this.portalAuth.issueMagicLink(contactId, orgId);
  }
}
