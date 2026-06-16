import { Injectable, NotFoundException } from "@nestjs/common";
import { basePrisma, forOrg } from "@kessel/db";
import Papa from "papaparse";
import type {
  ActivityType,
  ClientOrgDto,
  ClientOrgInput,
  ContactDto,
  ContactInput,
  CsvImportResultDto,
  DealActivityDto,
  DealActivityInput,
  DealDto,
  DealInput,
  DealStatus,
  MoveDealInput,
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

// Forme brute d'une ligne DealActivity telle que renvoyée par basePrisma.dealActivity.* .
// DealActivity est hors SCOPED_MODELS (pas de colonne orgId) — accès via basePrisma uniquement.
// L'isolation cross-tenant est garantie par assertDealInOrg (IDOR guard via Deal parent).
type DealActivityRow = {
  id: string;
  dealId: string;
  type: ActivityType;
  content: string;
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

// getField : normalisation FR/EN des colonnes CSV (Pitfall 6).
// Retourne la première valeur non vide parmi les clés fournies.
function getField(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = row[key];
    if (val !== undefined && val.trim() !== "") return val.trim();
  }
  return undefined;
}

function toDealActivityDto(row: DealActivityRow): DealActivityDto {
  return {
    id: row.id,
    dealId: row.dealId,
    type: row.type,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
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

  // ── Deal Move (CRM-04) ───────────────────────────────────────────────────

  // IDOR guard : le deal doit exister DANS l'org (forOrg injecte orgId dans le where du findFirst).
  // Utilisé par moveDeal, addActivity, listActivities — DealActivity hors SCOPED_MODELS (Pitfall 1).
  private async assertDealInOrg(orgId: string, dealId: string): Promise<void> {
    const deal = await forOrg(orgId).deal.findFirst({ where: { id: dealId } });
    if (!deal) {
      throw new NotFoundException("dealId introuvable dans l'organisation.");
    }
  }

  // CRM-04 : déplace un deal vers une colonne cible (status) à la position indiquée,
  // en réindexant toute la colonne cible 0..n dans une $transaction atomique (T-6-10).
  async moveDeal(orgId: string, id: string, input: MoveDealInput): Promise<DealDto> {
    // IDOR : vérifier que le deal appartient à l'org avant toute écriture (T-6-08).
    await this.assertDealInOrg(orgId, id);

    // Charger tous les deals de la colonne cible triés par position.
    const colDeals = await forOrg(orgId).deal.findMany({
      where: { status: input.status },
      orderBy: { position: "asc" },
    });

    // Retirer le deal déplacé de la colonne cible s'il y est déjà (cas intra-colonne).
    const filtered = colDeals.filter((d) => (d as { id: string }).id !== id);

    // Clamp la position cible dans [0, filtered.length] (insertion en fin si dépassement).
    const pos = Math.max(0, Math.min(input.position, filtered.length));

    // Insérer l'id du deal déplacé à la position cible.
    filtered.splice(pos, 0, { id } as (typeof filtered)[number]);

    // Construire les updates : 1 update status+position pour le deal déplacé + updates de position
    // pour tous les autres deals de la colonne cible (réindexation 0..n sans collision).
    const updates = filtered.map((d, i) => {
      const dealId = (d as { id: string }).id;
      if (dealId === id) {
        return basePrisma.deal.update({
          where: { id: dealId },
          data: { status: input.status, position: i },
        });
      }
      return basePrisma.deal.update({
        where: { id: dealId },
        data: { position: i },
      });
    });

    // Exécuter tous les updates en une seule transaction atomique (T-6-10).
    await basePrisma.$transaction(updates);

    // Relire le deal mis à jour via forOrg pour respecter l'isolation tenant.
    const updated = await forOrg(orgId).deal.findFirst({ where: { id } });
    return toDealDto(updated as DealRow);
  }

  // ── DealActivity (CRM-08) ────────────────────────────────────────────────

  // CRM-08 : ajoute une activité sur un deal.
  // IDOR : vérifier que dealId appartient à l'org AVANT tout accès basePrisma.dealActivity (T-6-07).
  // DealActivity hors SCOPED_MODELS — isolation uniquement via le guard deal parent.
  async addActivity(orgId: string, dealId: string, input: DealActivityInput): Promise<DealActivityDto> {
    await this.assertDealInOrg(orgId, dealId);
    const row = await basePrisma.dealActivity.create({
      data: { dealId, type: input.type, content: input.content },
    });
    return toDealActivityDto(row as DealActivityRow);
  }

  // CRM-08 : retourne la timeline d'activités d'un deal, triée desc (plus récent en premier).
  // IDOR : même guard deal parent que addActivity (T-6-07).
  async listActivities(orgId: string, dealId: string): Promise<DealActivityDto[]> {
    await this.assertDealInOrg(orgId, dealId);
    const rows = await basePrisma.dealActivity.findMany({
      where: { dealId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toDealActivityDto(r as DealActivityRow));
  }

  // IDOR guard : le contact doit exister DANS l'org (forOrg injecte orgId dans le where du findUnique).
  private async assertContactInOrg(orgId: string, contactId: string): Promise<void> {
    const contact = await forOrg(orgId).contact.findUnique({ where: { id: contactId } });
    if (!contact) {
      throw new NotFoundException("contactId introuvable dans l'organisation.");
    }
  }

  // ── Import CSV (CRM-09) ─────────────────────────────────────────────────────

  // CRM-09 : importe des contacts depuis un buffer CSV (papaparse server-side, T-6-14).
  // Normalisation FR/EN des headers via transformHeader (Pitfall 6).
  // Déduplication par email dans l'org : email existant → skipped (pas d'écrasement).
  // organisation fourni → findOrCreateClientOrg(orgId, org) → clientOrgId (scopé org, T-6-15).
  async importContacts(orgId: string, csvBuffer: Buffer): Promise<CsvImportResultDto> {
    const parsed = Papa.parse<Record<string, string>>(csvBuffer.toString("utf-8"), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim().toLowerCase(),
    });

    // Pré-charger les emails existants de l'org pour la déduplication (Set pour O(1) lookup).
    const existingContacts = await forOrg(orgId).contact.findMany({
      select: { email: true },
    });
    const existingEmails = new Set(
      existingContacts.map((c) => (c as { email: string }).email.toLowerCase()),
    );

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < parsed.data.length; i++) {
      const row = parsed.data[i];
      const lineNum = i + 2; // 1-indexed, +1 pour le header

      // Normalisation FR/EN (Pitfall 6) : nom/name, email, organisation/organization.
      const name = getField(row, "nom", "name");
      const email = getField(row, "email");
      const orgName = getField(row, "organisation", "organization");

      // Validation : nom et email requis.
      if (!name || !email) {
        errors.push(`Ligne ${lineNum}: nom ou email manquant`);
        continue;
      }

      // Validation format email basique.
      if (!email.includes("@")) {
        errors.push(`Ligne ${lineNum}: email invalide (${email})`);
        continue;
      }

      const normalizedEmail = email.toLowerCase();

      // Déduplication : email déjà présent dans l'org → skip (pas d'écrasement, CRM-09).
      if (existingEmails.has(normalizedEmail)) {
        skipped++;
        continue;
      }

      // Organisation fournie → find-or-create ClientOrg scopé org (T-6-15).
      let clientOrgId: string | null = null;
      if (orgName) {
        clientOrgId = await this.findOrCreateClientOrg(orgId, orgName);
      }

      // Créer le contact dans l'org.
      await forOrg(orgId).contact.create({
        data: {
          name,
          email: normalizedEmail,
          organizationName: orgName ?? null,
          ...(clientOrgId ? { clientOrgId } : {}),
        } as never,
      });

      // Ajouter l'email au Set pour déduplication intra-import (même fichier CSV).
      existingEmails.add(normalizedEmail);
      imported++;
    }

    return { imported, skipped, errors };
  }
}
