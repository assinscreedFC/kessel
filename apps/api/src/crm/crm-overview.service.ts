import { Injectable, NotFoundException } from "@nestjs/common";
import { db } from "@kessel/db";
import type {
  ClientOrgDto,
  ClientOrgOverviewDto,
  ContactDto,
  ContactOverviewDto,
  OverviewDealDto,
  OverviewProjectDto,
  OverviewProposalDto,
} from "@kessel/shared";

// CrmOverviewService — agrégation cross-domaine pour la vue 360 CRM (FOUND-05, CRM-07).
//
// FRONTIÈRES (FOUND-05) : ce service vit dans apps/api (couche orchestration), PAS dans packages/crm
// (domaine). Il utilise Kysely (db) pour les lectures cross-domaine sans créer de dépendance
// domaine→domaine. Aucun import de @kessel/crm ici.
//
// ISOLATION (T-6-11) : double WHERE id+orgId sur chaque requête → null → 404 (pattern PortalDataService).
// Proposals/Projects : innerJoin Deal OBLIGATOIRE (jamais Proposal.contactId ni Project.contactId — Pitfall 4).

@Injectable()
export class CrmOverviewService {
  // CRM-07 : vue 360 d'un contact.
  // Agrège deals + proposals + projects du contact via jointure Deal (Pitfall 4 respecté).
  // T-6-11 : double isolation contactId + orgId sur chaque requête Kysely.
  async getContactOverview(orgId: string, contactId: string): Promise<ContactOverviewDto> {
    // Vérifier que le contact appartient à l'org (IDOR, T-6-11).
    // executeTakeFirst -> null si cross-org -> 404.
    const contactRow = await db
      .selectFrom("Contact")
      .where("Contact.id", "=", contactId)
      .where("Contact.orgId", "=", orgId)
      .select([
        "Contact.id",
        "Contact.name",
        "Contact.email",
        "Contact.organizationName",
        "Contact.clientOrgId",
        "Contact.createdAt",
        "Contact.updatedAt",
      ])
      .executeTakeFirst();

    if (!contactRow) {
      throw new NotFoundException("Contact introuvable dans l'organisation.");
    }

    const contact: ContactDto = {
      id: contactRow.id,
      name: contactRow.name,
      email: contactRow.email,
      organizationName: contactRow.organizationName ?? null,
      clientOrgId: contactRow.clientOrgId ?? null,
      createdAt:
        contactRow.createdAt instanceof Date
          ? contactRow.createdAt.toISOString()
          : String(contactRow.createdAt),
      updatedAt:
        contactRow.updatedAt instanceof Date
          ? contactRow.updatedAt.toISOString()
          : String(contactRow.updatedAt),
    };

    // Deals du contact dans l'org (double isolation contactId + orgId).
    // orderBy createdAt desc : garantit deals[0] = deal le plus récent (l'UI 360 monte
    // ActivityTimeline sur deals[0]?.id — sans tri, l'ordre Postgres est non déterministe).
    const dealRows = await db
      .selectFrom("Deal")
      .where("Deal.contactId", "=", contactId)
      .where("Deal.orgId", "=", orgId)
      .select(["Deal.id", "Deal.title", "Deal.status", "Deal.amount"])
      .orderBy("Deal.createdAt", "desc")
      .execute();

    const deals: OverviewDealDto[] = dealRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status as OverviewDealDto["status"],
      // Decimal -> string au boundary (Pitfall 2)
      amount: row.amount != null ? String(row.amount) : null,
    }));

    // Propositions via innerJoin Deal (pas de Proposal.contactId — Pitfall 4 T-6-12).
    // Double isolation : Deal.contactId + Proposal.orgId.
    const proposalRows = await db
      .selectFrom("Proposal")
      .innerJoin("Deal", "Deal.id", "Proposal.dealId")
      .where("Deal.contactId", "=", contactId)
      .where("Proposal.orgId", "=", orgId)
      .select(["Proposal.id", "Proposal.title", "Proposal.status"])
      .execute();

    const proposals: OverviewProposalDto[] = proposalRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
    }));

    // Projets via innerJoin Deal (pas de Project.contactId — Pitfall 4).
    // Double isolation : Deal.contactId + Project.orgId.
    const projectRows = await db
      .selectFrom("Project")
      .innerJoin("Deal", "Deal.id", "Project.dealId")
      .where("Deal.contactId", "=", contactId)
      .where("Project.orgId", "=", orgId)
      .select(["Project.id", "Project.title", "Project.status"])
      .execute();

    const projects: OverviewProjectDto[] = projectRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
    }));

    return { contact, deals, proposals, projects };
  }

  // CRM-07 : vue 360 d'une organisation cliente.
  // Agrège contacts, deals, proposals, projects liés à la ClientOrg.
  // T-6-11 : double isolation clientOrgId + orgId.
  async getClientOrgOverview(orgId: string, clientOrgId: string): Promise<ClientOrgOverviewDto> {
    // Vérifier que la ClientOrg appartient à l'org (IDOR, T-6-11).
    const clientOrgRow = await db
      .selectFrom("ClientOrg")
      .where("ClientOrg.id", "=", clientOrgId)
      .where("ClientOrg.orgId", "=", orgId)
      .select(["ClientOrg.id", "ClientOrg.name", "ClientOrg.createdAt"])
      .executeTakeFirst();

    if (!clientOrgRow) {
      throw new NotFoundException("ClientOrg introuvable dans l'organisation.");
    }

    const clientOrg: ClientOrgDto = {
      id: clientOrgRow.id,
      name: clientOrgRow.name,
      createdAt:
        clientOrgRow.createdAt instanceof Date
          ? clientOrgRow.createdAt.toISOString()
          : String(clientOrgRow.createdAt),
    };

    // Deals rattachés à la ClientOrg (double isolation clientOrgId + orgId).
    const dealRows = await db
      .selectFrom("Deal")
      .where("Deal.clientOrgId", "=", clientOrgId)
      .where("Deal.orgId", "=", orgId)
      .select(["Deal.id", "Deal.title", "Deal.status", "Deal.amount"])
      .orderBy("Deal.createdAt", "desc")
      .execute();

    const deals: OverviewDealDto[] = dealRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status as OverviewDealDto["status"],
      amount: row.amount != null ? String(row.amount) : null,
    }));

    // Propositions via innerJoin Deal WHERE Deal.clientOrgId (Pitfall 4 — via Deal).
    // Double isolation : Deal.clientOrgId + Proposal.orgId.
    const proposalRows = await db
      .selectFrom("Proposal")
      .innerJoin("Deal", "Deal.id", "Proposal.dealId")
      .where("Deal.clientOrgId", "=", clientOrgId)
      .where("Proposal.orgId", "=", orgId)
      .select(["Proposal.id", "Proposal.title", "Proposal.status"])
      .execute();

    const proposals: OverviewProposalDto[] = proposalRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
    }));

    // Projets via innerJoin Deal WHERE Deal.clientOrgId (Pitfall 4 — via Deal).
    const projectRows = await db
      .selectFrom("Project")
      .innerJoin("Deal", "Deal.id", "Project.dealId")
      .where("Deal.clientOrgId", "=", clientOrgId)
      .where("Project.orgId", "=", orgId)
      .select(["Project.id", "Project.title", "Project.status"])
      .execute();

    const projects: OverviewProjectDto[] = projectRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
    }));

    // contactCount : contacts rattachés à la ClientOrg dans l'org.
    const contactCountResult = await db
      .selectFrom("Contact")
      .where("Contact.clientOrgId", "=", clientOrgId)
      .where("Contact.orgId", "=", orgId)
      .select(db.fn.countAll<number>().as("count"))
      .executeTakeFirst();

    const contactCount = Number(contactCountResult?.count ?? 0);
    const dealCount = deals.length;

    return { clientOrg, contactCount, dealCount, deals, proposals, projects };
  }
}
