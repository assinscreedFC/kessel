import { Controller, Get, Inject, NotFoundException, Req, UseGuards } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { ClientPortalGuard, type PortalContact } from "./guards/client-portal.guard";
import { PortalDataService } from "./portal-data.service";

// PortalController — endpoints de lecture données portail client (PORT-02/03/04/05).
//
// @AllowAnonymous : contourne l'AuthGuard global Better Auth (portal JWT ≠ Better Auth session).
// @UseGuards(ClientPortalGuard) : vérifie le JWT portail et injecte req.portalContact (T-4-iso).
// SÉCURITÉ (T-4-write) : UNIQUEMENT des @Get — aucun @Post/@Patch/@Delete sous /portal/*.

@Controller("portal")
@AllowAnonymous()
@UseGuards(ClientPortalGuard)
export class PortalController {
  constructor(@Inject(PortalDataService) private readonly data: PortalDataService) {}

  // PORT-02 : liste les propositions du contact (join Deal, scopé contactId+orgId).
  @Get("proposals")
  proposals(@Req() req: { portalContact: PortalContact }) {
    const { contactId, orgId } = req.portalContact;
    return this.data.listProposals(contactId, orgId);
  }

  // PORT-03 : projet le plus récent + tâches (lecture seule, scopé contactId+orgId).
  // 404 si le contact n'a pas de projet dans cet org (cross-contact/cross-org safe).
  @Get("project")
  async project(@Req() req: { portalContact: PortalContact }) {
    const { contactId, orgId } = req.portalContact;
    const result = await this.data.getProjectWithTasks(contactId, orgId);
    if (!result) throw new NotFoundException();
    return result;
  }

  // PORT-04 : paiements acompte/solde du projet du contact (scopé contactId+orgId).
  @Get("payments")
  payments(@Req() req: { portalContact: PortalContact }) {
    const { contactId, orgId } = req.portalContact;
    return this.data.getPayments(contactId, orgId);
  }

  // PORT-05 : fichiers partagés par l'agence (double WHERE contactId+orgId — T-8-idor).
  // URL présignée MinIO TTL 300s incluse dans chaque PortalFileDto.
  @Get("files")
  files(@Req() req: { portalContact: PortalContact }) {
    const { contactId, orgId } = req.portalContact;
    return this.data.listFiles(contactId, orgId);
  }

  // PORT-07 : branding de l'org (logo + brandColor) — orgId résolu depuis JWT portail (T-8-brand-iso).
  // UNIQUEMENT @Get — aucun @Post/@Patch/@Delete (T-4-write).
  @Get("branding")
  branding(@Req() req: { portalContact: PortalContact }) {
    const { orgId } = req.portalContact;
    return this.data.getBranding(orgId);
  }
}
