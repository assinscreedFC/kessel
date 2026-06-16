import { Injectable, NotFoundException } from "@nestjs/common";
import { forOrg } from "@kessel/db";
import type {
  ClientOrgDto,
  ClientOrgInput,
  ContactDto,
  ContactInput,
  DealDto,
  DealInput,
  DealStatus,
} from "@kessel/shared";

// CrmService — logique domaine CRM (@kessel/crm, type:domain scope:crm).
//
// FRONTIÈRES (FOUND-05) : ce service consomme @kessel/db via forOrg(orgId) UNIQUEMENT — jamais
// le client Prisma brut non scopé (réservé à l'infra). Le contrat de DTO vient de @kessel/shared.
// Aucun import d'un autre domaine. L'orgId reçu = session.activeOrganizationId (source canonique).
//
// Les lignes Contact/Deal sont scopées par forOrg : toute lecture/écriture est bornée à l'org.
// Au boundary, amount (Prisma Decimal) est mappé en string (Pitfall 2) et les dates en ISO string.

// Forme brute d'une ligne Contact telle que renvoyée par forOrg(orgId).contact.* .
type ContactRow = {
  id: string;
  name: string;
  email: string;
  organizationName: string | null;
  clientOrgId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Forme brute d'une ligne ClientOrg telle que renvoyée par forOrg(orgId).clientOrg.* .
type ClientOrgRow = {
  id: string;
  name: string;
  createdAt: Date;
};

// amount est un Prisma Decimal (objet .toString()) — typé large pour rester indépendant du runtime Decimal.
type DealRow = {
  id: string;
  title: string;
  contactId: string;
  status: DealStatus;
  amount: { toString(): string } | null;
  position: number;
  clientOrgId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toContactDto(row: ContactRow): ContactDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organizationName: row.organizationName,
    clientOrgId: row.clientOrgId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toClientOrgDto(row: ClientOrgRow): ClientOrgDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDealDto(row: DealRow): DealDto {
  return {
    id: row.id,
    title: row.title,
    contactId: row.contactId,
    status: row.status,
    // Pitfall 2 : Decimal -> string au boundary (précision monétaire) ; JAMAIS l'objet Decimal brut.
    amount: row.amount != null ? row.amount.toString() : null,
    position: row.position,
    clientOrgId: row.clientOrgId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

@Injectable()
export class CrmService {
  async listContacts(orgId: string): Promise<ContactDto[]> {
    const rows = await forOrg(orgId).contact.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toContactDto(r as ContactRow));
  }

  async getContact(orgId: string, id: string): Promise<ContactDto | null> {
    const row = await forOrg(orgId).contact.findFirst({ where: { id } });
    return row ? toContactDto(row as ContactRow) : null;
  }

  async createContact(orgId: string, input: ContactInput): Promise<ContactDto> {
    const row = await forOrg(orgId).contact.create({
      data: {
        name: input.name,
        email: input.email,
        organizationName: input.organizationName ?? null,
      } as never,
    });
    return toContactDto(row as ContactRow);
  }

  async updateContact(
    orgId: string,
    id: string,
    input: Partial<ContactInput>,
  ): Promise<ContactDto> {
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.email !== undefined) data.email = input.email;
    if (input.organizationName !== undefined) data.organizationName = input.organizationName ?? null;

    // CRM-06 : rattachement à une ClientOrg avec IDOR guard (T-6-05).
    // Si clientOrgId est fourni (non undefined) et non null, vérifier qu'elle appartient à l'org.
    // null = détacher le contact de sa ClientOrg actuelle.
    if (input.clientOrgId !== undefined) {
      if (input.clientOrgId !== null) {
        await this.assertClientOrgInOrg(orgId, input.clientOrgId);
      }
      data.clientOrgId = input.clientOrgId ?? null;
    }

    const row = await forOrg(orgId).contact.update({
      where: { id },
      data: data as never,
    });
    return toContactDto(row as ContactRow);
  }

  // ── ClientOrg (CRM-05) ────────────────────────────────────────────────────

  async createClientOrg(orgId: string, input: ClientOrgInput): Promise<ClientOrgDto> {
    const row = await forOrg(orgId).clientOrg.create({
      data: { name: input.name } as never,
    });
    return toClientOrgDto(row as ClientOrgRow);
  }

  async listClientOrgs(orgId: string): Promise<ClientOrgDto[]> {
    const rows = await forOrg(orgId).clientOrg.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toClientOrgDto(r as ClientOrgRow));
  }

  async getClientOrg(orgId: string, id: string): Promise<ClientOrgDto | null> {
    const row = await forOrg(orgId).clientOrg.findFirst({ where: { id } });
    return row ? toClientOrgDto(row as ClientOrgRow) : null;
  }

  // findOrCreateClientOrg : utilisé par l'import CSV (Plan 04) pour associer la colonne "organisation"
  // à une ClientOrg idempotente — une seule ClientOrg créée par nom+org même si plusieurs contacts la mentionnent.
  async findOrCreateClientOrg(orgId: string, name: string): Promise<string> {
    const existing = await forOrg(orgId).clientOrg.findFirst({ where: { name } });
    if (existing) return existing.id;
    const created = await forOrg(orgId).clientOrg.create({
      data: { name } as never,
    });
    return created.id;
  }

  // IDOR guard : la ClientOrg doit exister DANS l'org (forOrg injecte orgId dans le where du findUnique).
  private async assertClientOrgInOrg(orgId: string, clientOrgId: string): Promise<void> {
    const clientOrg = await forOrg(orgId).clientOrg.findUnique({ where: { id: clientOrgId } });
    if (!clientOrg) {
      throw new NotFoundException("clientOrgId introuvable dans l'organisation.");
    }
  }

  async listDeals(orgId: string, status?: DealStatus): Promise<DealDto[]> {
    // CRM-03 : le filtre statut est appliqué CÔTÉ DB (where), jamais côté client.
    const rows = await forOrg(orgId).deal.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toDealDto(r as DealRow));
  }

  async getDeal(orgId: string, id: string): Promise<DealDto | null> {
    const row = await forOrg(orgId).deal.findFirst({ where: { id } });
    return row ? toDealDto(row as DealRow) : null;
  }

  async createDeal(orgId: string, input: DealInput): Promise<DealDto> {
    // IDOR (T-2-idor) : VÉRIFIER D'ABORD que contactId appartient à l'org via forOrg.
    // forOrg scope le findUnique à l'orgId courant -> un contactId d'une AUTRE org est invisible
    // (renvoie null) -> on rejette AVANT tout insert. Empêche de rattacher un deal au contact d'autrui.
    await this.assertContactInOrg(orgId, input.contactId);

    const row = await forOrg(orgId).deal.create({
      data: {
        title: input.title,
        contactId: input.contactId,
        status: input.status,
        amount: input.amount ?? null,
      } as never,
    });
    return toDealDto(row as DealRow);
  }

  async updateDeal(
    orgId: string,
    id: string,
    input: Partial<DealInput>,
  ): Promise<DealDto> {
    // Si contactId change, re-vérifier l'appartenance à l'org (IDOR) avant la maj.
    if (input.contactId !== undefined) {
      await this.assertContactInOrg(orgId, input.contactId);
    }

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.contactId !== undefined) data.contactId = input.contactId;
    if (input.status !== undefined) data.status = input.status;
    if (input.amount !== undefined) data.amount = input.amount ?? null;

    const row = await forOrg(orgId).deal.update({
      where: { id },
      data: data as never,
    });
    return toDealDto(row as DealRow);
  }

  // IDOR guard : le contact doit exister DANS l'org (forOrg injecte orgId dans le where du findUnique).
  private async assertContactInOrg(orgId: string, contactId: string): Promise<void> {
    const contact = await forOrg(orgId).contact.findUnique({ where: { id: contactId } });
    if (!contact) {
      throw new NotFoundException("contactId introuvable dans l'organisation.");
    }
  }
}
