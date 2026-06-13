import { Injectable, NotFoundException } from "@nestjs/common";
import { forOrg } from "@kessel/db";
import type {
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
  createdAt: Date;
  updatedAt: Date;
};

// amount est un Prisma Decimal (objet .toString()) — typé large pour rester indépendant du runtime Decimal.
type DealRow = {
  id: string;
  title: string;
  contactId: string;
  status: DealStatus;
  amount: { toString(): string } | null;
  createdAt: Date;
  updatedAt: Date;
};

function toContactDto(row: ContactRow): ContactDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    organizationName: row.organizationName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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

    const row = await forOrg(orgId).contact.update({
      where: { id },
      data: data as never,
    });
    return toContactDto(row as ContactRow);
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
