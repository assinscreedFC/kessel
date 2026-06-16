import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { forOrg } from "@kessel/db";
import { PdfService } from "./pdf.service";
import type {
  CreateFromTemplateInput,
  CreateProposalInput,
  PricingItemDto,
  PricingItemInput,
  ProposalDto,
  ProposalTemplateDto,
  ProposalTemplateInput,
  QuoteLineDto,
  QuoteLineInput,
  UpdateProposalInput,
  VatTotalsDto,
} from "@kessel/shared";
import { computeVatTotals } from "@kessel/shared";
import { grandTotal, lineTotal } from "./money";

// ProposalsService — logique domaine propositions & tarifs (@kessel/proposals, type:domain scope:proposals).
//
// FRONTIÈRES (FOUND-05) : ce service consomme @kessel/db via forOrg(orgId) UNIQUEMENT — jamais le
// client Prisma brut non scopé. Le contrat de DTO vient de @kessel/shared. Aucun import d'un autre
// domaine. L'orgId reçu = session.activeOrganizationId (source canonique).
//
// IDOR (T-3-idor) : avant de rattacher une Proposal à un deal/template, on vérifie l'appartenance org
// du parent via forOrg(orgId).<model>.findUnique — un parent d'une autre org est INVISIBLE -> 404.
//
// SNAPSHOT (T-3-snapshot) : les QuoteLine copient description/quantity/unitPrice fournis ; AUCUNE FK
// vers PricingItem. Modifier la grille ne mute jamais une ligne existante.
//
// SCOPING QuoteLine : QuoteLine n'est PAS dans SCOPED_MODELS (pas de colonne orgId). On l'accède
// TOUJOURS via sa Proposal parente forOrg-scopée : nested writes (proposal.update { lines: {...} })
// et nested read (proposal.findUnique include lines). Une proposal d'une autre org est invisible
// sous forOrg(orgId) -> ses lignes sont inatteignables (isolation prouvée par le parent).
//
// MONNAIE (T-3-math) : lineTotal/grandTotal via money.ts (decimal.js). Decimal -> string au boundary.

type DecimalLike = { toString(): string };

type QuoteLineRow = {
  id: string;
  description: string;
  quantity: DecimalLike;
  unitPrice: DecimalLike;
  position: number;
  vatRate: DecimalLike;
};

type ProposalRow = {
  id: string;
  dealId: string;
  title: string;
  bodyJson: unknown;
  status: string;
  lines: QuoteLineRow[];
  createdAt: Date;
  updatedAt: Date;
};

type TemplateRow = {
  id: string;
  name: string;
  bodyJson: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type PricingItemRow = {
  id: string;
  name: string;
  unitPrice: DecimalLike;
  unit: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toQuoteLineDto(row: QuoteLineRow): QuoteLineDto {
  const quantity = row.quantity.toString();
  const unitPrice = row.unitPrice.toString();
  return {
    id: row.id,
    description: row.description,
    quantity,
    unitPrice,
    lineTotal: lineTotal(quantity, unitPrice),
    position: row.position,
    vatRate: row.vatRate.toString(),
  };
}

function toProposalDto(row: ProposalRow, vatRegime: "FRANCHISE" | "NORMAL" | "INTRACOM"): ProposalDto {
  const lines = [...row.lines]
    .sort((a, b) => a.position - b.position)
    .map(toQuoteLineDto);

  const vatTotals: VatTotalsDto = computeVatTotals(
    lines.map((l) => ({
      unitPrice: l.unitPrice,
      quantity: l.quantity,
      vatRate: Number(l.vatRate),
    })),
    vatRegime,
  );

  return {
    id: row.id,
    dealId: row.dealId,
    title: row.title,
    bodyJson: row.bodyJson,
    status: row.status as ProposalDto["status"],
    lines,
    grandTotal: grandTotal(
      lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
    ),
    vatTotals,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// Lit le régime TVA de l'org (1 seule lecture par appel de service — anti N+1).
async function readOrgVatRegime(orgId: string): Promise<"FRANCHISE" | "NORMAL" | "INTRACOM"> {
  const org = (await forOrg(orgId).organization.findUnique({
    where: { id: orgId },
    select: { vatRegime: true } as never,
  })) as { vatRegime: string } | null;
  const regime = org?.vatRegime ?? "NORMAL";
  if (regime === "FRANCHISE" || regime === "NORMAL" || regime === "INTRACOM") return regime;
  return "NORMAL";
}

function toTemplateDto(row: TemplateRow): ProposalTemplateDto {
  return {
    id: row.id,
    name: row.name,
    bodyJson: row.bodyJson,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPricingItemDto(row: PricingItemRow): PricingItemDto {
  return {
    id: row.id,
    name: row.name,
    // Decimal -> string au boundary (précision monétaire).
    unitPrice: row.unitPrice.toString(),
    unit: row.unit,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// include partagé : une Proposal renvoie toujours ses lignes triées par position.
const INCLUDE_LINES = { lines: { orderBy: { position: "asc" } } } as const;

@Injectable()
export class ProposalsService {
  // @Inject explicite : esbuild/SWC émet design:paramtypes mais on garde le token DI explicite
  // (cohérence avec les controllers ; robustesse au bundle).
  constructor(@Inject(PdfService) private readonly pdf: PdfService) {}

  // === Proposals ===

  async listProposals(orgId: string): Promise<ProposalDto[]> {
    const [rows, vatRegime] = await Promise.all([
      forOrg(orgId).proposal.findMany({
        orderBy: { createdAt: "desc" },
        include: INCLUDE_LINES as never,
      }),
      readOrgVatRegime(orgId),
    ]);
    return rows.map((r) => toProposalDto(r as unknown as ProposalRow, vatRegime));
  }

  async getProposal(orgId: string, id: string): Promise<ProposalDto | null> {
    const [row, vatRegime] = await Promise.all([
      forOrg(orgId).proposal.findFirst({
        where: { id },
        include: INCLUDE_LINES as never,
      }),
      readOrgVatRegime(orgId),
    ]);
    return row ? toProposalDto(row as unknown as ProposalRow, vatRegime) : null;
  }

  // PROP-07 : rend le PDF d'une proposition de l'org. Réutilise getProposal (scopé forOrg) -> 404
  // si la proposition n'appartient pas à l'org (T-3-pdf-iso : jamais de PDF cross-tenant). Récupère
  // le nom de l'org (table organization, par son id canonique) pour le header/footer, délègue au PdfService.
  async renderPdf(orgId: string, id: string): Promise<Buffer> {
    const proposal = await this.getProposal(orgId, id);
    if (!proposal) {
      throw new NotFoundException("Proposition introuvable dans l'organisation.");
    }
    // Organization n'est PAS dans SCOPED_MODELS (table d'identité) : findUnique par id canonique
    // (= orgId) la renvoie en pass-through. orgId vient de la session -> l'org existe toujours.
    const org = (await forOrg(orgId).organization.findUnique({
      where: { id: orgId },
    })) as { name: string } | null;

    return this.pdf.renderProposalPdf({
      title: proposal.title,
      bodyJson: proposal.bodyJson,
      lines: proposal.lines,
      grandTotal: proposal.grandTotal,
      vatTotals: proposal.vatTotals,
      org: { name: org?.name ?? "" },
    });
  }

  async createProposal(orgId: string, input: CreateProposalInput): Promise<ProposalDto> {
    // IDOR (T-3-idor) : le deal doit appartenir à l'org (invisible sous forOrg sinon -> 404).
    await this.assertDealInOrg(orgId, input.dealId);

    // SNAPSHOT atomique (T-3-snapshot) : si des `lines` sont fournies (ex. moteur IA Phase 4), on les
    // crée dans le MÊME proposal.create (nested write, 1 seule écriture) — même forme de snapshot que
    // addQuoteLine (description/quantity/unitPrice/position copiés, AUCUNE FK PricingItem). Pas de
    // boucle addQuoteLine -> pas de N writes, pas de duplication de la logique snapshot/totaux.
    // `lines` absent/vide -> comportement Phase 3 inchangé (proposition sans ligne).
    const lines = input.lines ?? [];

    const [row, vatRegime] = await Promise.all([
      forOrg(orgId).proposal.create({
        data: {
          dealId: input.dealId,
          title: input.title,
          bodyJson: input.bodyJson as never,
          status: "DRAFT",
          lines: {
            create: lines.map((l) => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              position: l.position,
              vatRate: l.vatRate ?? 0.20,
            })),
          },
        } as never,
        include: INCLUDE_LINES as never,
      }),
      readOrgVatRegime(orgId),
    ]);
    return toProposalDto(row as unknown as ProposalRow, vatRegime);
  }

  async createFromTemplate(orgId: string, input: CreateFromTemplateInput): Promise<ProposalDto> {
    // IDOR (T-3-idor) : template ET deal doivent appartenir à l'org. Un parent d'une autre org est
    // invisible sous forOrg -> 404. Aucune copie cross-tenant possible.
    const template = await forOrg(orgId).proposalTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (!template) {
      throw new NotFoundException("templateId introuvable dans l'organisation.");
    }
    await this.assertDealInOrg(orgId, input.dealId);

    // Le SERVEUR copie le bodyJson du template (anti-tampering : le client ne l'envoie jamais).
    const [row, vatRegime] = await Promise.all([
      forOrg(orgId).proposal.create({
        data: {
          dealId: input.dealId,
          title: input.title,
          bodyJson: (template as unknown as TemplateRow).bodyJson as never,
          status: "DRAFT",
        } as never,
        include: INCLUDE_LINES as never,
      }),
      readOrgVatRegime(orgId),
    ]);
    return toProposalDto(row as unknown as ProposalRow, vatRegime);
  }

  async updateProposal(orgId: string, id: string, input: UpdateProposalInput): Promise<ProposalDto> {
    await this.assertProposalInOrg(orgId, id);

    const data: Record<string, unknown> = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.bodyJson !== undefined) data.bodyJson = input.bodyJson;

    const [row, vatRegime] = await Promise.all([
      forOrg(orgId).proposal.update({
        where: { id },
        data: data as never,
        include: INCLUDE_LINES as never,
      }),
      readOrgVatRegime(orgId),
    ]);
    return toProposalDto(row as unknown as ProposalRow, vatRegime);
  }

  async deleteProposal(orgId: string, id: string): Promise<void> {
    await this.assertProposalInOrg(orgId, id);
    // Cascade delete des lignes via le schéma (QuoteLine.proposalId onDelete: Cascade).
    await forOrg(orgId).proposal.delete({ where: { id } });
  }

  // === Quote lines (nested sous Proposal) ===
  // Toujours médiées par la Proposal forOrg-scopée : on mute via proposal.update { lines: {...} }.
  // La Proposal d'une autre org est invisible (assertProposalInOrg -> 404) ; ses lignes inatteignables.

  async addQuoteLine(orgId: string, proposalId: string, input: QuoteLineInput): Promise<ProposalDto> {
    await this.assertProposalInOrg(orgId, proposalId);
    // SNAPSHOT : on COPIE description/quantity/unitPrice/position fournis (aucune FK PricingItem).
    const [row, vatRegime] = await Promise.all([
      forOrg(orgId).proposal.update({
        where: { id: proposalId },
        data: {
          lines: {
            create: {
              description: input.description,
              quantity: input.quantity,
              unitPrice: input.unitPrice,
              position: input.position,
              vatRate: input.vatRate ?? 0.20,
            },
          },
        } as never,
        include: INCLUDE_LINES as never,
      }),
      readOrgVatRegime(orgId),
    ]);
    return toProposalDto(row as unknown as ProposalRow, vatRegime);
  }

  async updateQuoteLine(
    orgId: string,
    proposalId: string,
    lineId: string,
    input: Partial<QuoteLineInput>,
  ): Promise<ProposalDto> {
    await this.assertProposalInOrg(orgId, proposalId);
    await this.assertLineInProposal(orgId, proposalId, lineId);

    const data: Record<string, unknown> = {};
    if (input.description !== undefined) data.description = input.description;
    if (input.quantity !== undefined) data.quantity = input.quantity;
    if (input.unitPrice !== undefined) data.unitPrice = input.unitPrice;
    if (input.position !== undefined) data.position = input.position;
    if (input.vatRate !== undefined) data.vatRate = input.vatRate;

    // Update nested : la ligne est ciblée VIA sa Proposal scopée (lines.update where id).
    const [row, vatRegime] = await Promise.all([
      forOrg(orgId).proposal.update({
        where: { id: proposalId },
        data: { lines: { update: { where: { id: lineId }, data } } } as never,
        include: INCLUDE_LINES as never,
      }),
      readOrgVatRegime(orgId),
    ]);
    return toProposalDto(row as unknown as ProposalRow, vatRegime);
  }

  async deleteQuoteLine(orgId: string, proposalId: string, lineId: string): Promise<ProposalDto> {
    await this.assertProposalInOrg(orgId, proposalId);
    await this.assertLineInProposal(orgId, proposalId, lineId);

    const [row, vatRegime] = await Promise.all([
      forOrg(orgId).proposal.update({
        where: { id: proposalId },
        data: { lines: { delete: { id: lineId } } } as never,
        include: INCLUDE_LINES as never,
      }),
      readOrgVatRegime(orgId),
    ]);
    return toProposalDto(row as unknown as ProposalRow, vatRegime);
  }

  async reorderQuoteLines(orgId: string, proposalId: string, orderedIds: string[]): Promise<ProposalDto> {
    const proposal = await this.assertProposalInOrg(orgId, proposalId);
    // Toutes les lignes réordonnées doivent appartenir à CETTE proposal (sinon 404).
    const ownIds = new Set(proposal.lines.map((l) => l.id));
    for (const id of orderedIds) {
      if (!ownIds.has(id)) {
        throw new NotFoundException("Ligne introuvable dans la proposition.");
      }
    }
    // Réécrit les positions selon l'ordre fourni (nested updates via la Proposal scopée).
    const [row, vatRegime] = await Promise.all([
      forOrg(orgId).proposal.update({
        where: { id: proposalId },
        data: {
          lines: {
            update: orderedIds.map((id, index) => ({
              where: { id },
              data: { position: index },
            })),
          },
        } as never,
        include: INCLUDE_LINES as never,
      }),
      readOrgVatRegime(orgId),
    ]);
    return toProposalDto(row as unknown as ProposalRow, vatRegime);
  }

  // === Templates ===

  async listTemplates(orgId: string): Promise<ProposalTemplateDto[]> {
    const rows = await forOrg(orgId).proposalTemplate.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toTemplateDto(r as unknown as TemplateRow));
  }

  async getTemplate(orgId: string, id: string): Promise<ProposalTemplateDto | null> {
    const row = await forOrg(orgId).proposalTemplate.findFirst({ where: { id } });
    return row ? toTemplateDto(row as unknown as TemplateRow) : null;
  }

  async createTemplate(orgId: string, input: ProposalTemplateInput): Promise<ProposalTemplateDto> {
    const row = await forOrg(orgId).proposalTemplate.create({
      data: { name: input.name, bodyJson: input.bodyJson as never } as never,
    });
    return toTemplateDto(row as unknown as TemplateRow);
  }

  async updateTemplate(
    orgId: string,
    id: string,
    input: Partial<ProposalTemplateInput>,
  ): Promise<ProposalTemplateDto> {
    await this.assertTemplateInOrg(orgId, id);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.bodyJson !== undefined) data.bodyJson = input.bodyJson;

    const row = await forOrg(orgId).proposalTemplate.update({
      where: { id },
      data: data as never,
    });
    return toTemplateDto(row as unknown as TemplateRow);
  }

  async deleteTemplate(orgId: string, id: string): Promise<void> {
    await this.assertTemplateInOrg(orgId, id);
    await forOrg(orgId).proposalTemplate.delete({ where: { id } });
  }

  // === Pricing items (grille de tarifs) ===

  async listPricingItems(orgId: string): Promise<PricingItemDto[]> {
    const rows = await forOrg(orgId).pricingItem.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => toPricingItemDto(r as unknown as PricingItemRow));
  }

  async getPricingItem(orgId: string, id: string): Promise<PricingItemDto | null> {
    const row = await forOrg(orgId).pricingItem.findFirst({ where: { id } });
    return row ? toPricingItemDto(row as unknown as PricingItemRow) : null;
  }

  async createPricingItem(orgId: string, input: PricingItemInput): Promise<PricingItemDto> {
    const row = await forOrg(orgId).pricingItem.create({
      data: {
        name: input.name,
        unitPrice: input.unitPrice,
        unit: input.unit ?? null,
      } as never,
    });
    return toPricingItemDto(row as unknown as PricingItemRow);
  }

  async updatePricingItem(
    orgId: string,
    id: string,
    input: Partial<PricingItemInput>,
  ): Promise<PricingItemDto> {
    await this.assertPricingItemInOrg(orgId, id);
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.unitPrice !== undefined) data.unitPrice = input.unitPrice;
    if (input.unit !== undefined) data.unit = input.unit ?? null;

    const row = await forOrg(orgId).pricingItem.update({
      where: { id },
      data: data as never,
    });
    return toPricingItemDto(row as unknown as PricingItemRow);
  }

  async deletePricingItem(orgId: string, id: string): Promise<void> {
    await this.assertPricingItemInOrg(orgId, id);
    await forOrg(orgId).pricingItem.delete({ where: { id } });
  }

  // === IDOR / scoping guards (forOrg findUnique : parent d'une autre org invisible -> 404) ===

  private async assertDealInOrg(orgId: string, dealId: string): Promise<void> {
    const deal = await forOrg(orgId).deal.findUnique({ where: { id: dealId } });
    if (!deal) {
      throw new NotFoundException("dealId introuvable dans l'organisation.");
    }
  }

  private async assertProposalInOrg(orgId: string, proposalId: string): Promise<ProposalRow> {
    const proposal = await forOrg(orgId).proposal.findUnique({
      where: { id: proposalId },
      include: INCLUDE_LINES as never,
    });
    if (!proposal) {
      throw new NotFoundException("Proposition introuvable dans l'organisation.");
    }
    return proposal as unknown as ProposalRow;
  }

  private async assertTemplateInOrg(orgId: string, templateId: string): Promise<void> {
    const template = await forOrg(orgId).proposalTemplate.findUnique({ where: { id: templateId } });
    if (!template) {
      throw new NotFoundException("Template introuvable dans l'organisation.");
    }
  }

  private async assertPricingItemInOrg(orgId: string, id: string): Promise<void> {
    const item = await forOrg(orgId).pricingItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException("Élément de grille introuvable dans l'organisation.");
    }
  }

  private async assertLineInProposal(
    orgId: string,
    proposalId: string,
    lineId: string,
  ): Promise<void> {
    const proposal = await this.assertProposalInOrg(orgId, proposalId);
    if (!proposal.lines.some((l) => l.id === lineId)) {
      throw new NotFoundException("Ligne introuvable dans la proposition.");
    }
  }
}
