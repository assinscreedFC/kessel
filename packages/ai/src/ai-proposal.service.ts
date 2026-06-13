import { Inject, Injectable } from "@nestjs/common";
import { forOrg } from "@kessel/db";
import { ProposalsService } from "@kessel/proposals";
import type { ProposalDto } from "@kessel/shared";
import {
  PROPOSAL_GENERATOR,
  type GenerateProposalPricingItem,
  type GenerateProposalWonExample,
  type ProposalGenerator,
} from "./proposal-generator";
import { sectionsToProseMirror } from "./body-doc";
import { proseMirrorToText } from "./body-text";

// AiProposalService — la JONCTION : le cœur pur (Plan 01) rencontre les données réelles de l'org
// (forOrg) et la persistance éprouvée (ProposalsService, Phase 3).
//
// FRONTIÈRES (FOUND-05) : consomme @kessel/db via forOrg(orgId) UNIQUEMENT (jamais le client Prisma brut non scopé),
// @kessel/proposals (ProposalsService) pour persister, @kessel/shared pour les contrats. Le seul
// accès réseau (LLM) est isolé derrière l'interface ProposalGenerator injectée (token DI Symbol).
//
// ISOLATION (T-4-iso) : grille de tarifs ET historique gagné lus via forOrg(orgId) -> l'historique
// d'une autre org est INATTEIGNABLE, aucune fuite cross-org dans le few-shot.
//
// IDOR (T-4-idor) : la validation dealId est déléguée à ProposalsService.createProposal (forOrg
// findUnique avant insert) -> 404 si le deal n'est pas dans l'org. On ne réécrit pas ce guard.
//
// CALIBRATION (AI-02) : les propositions GAGNÉES (deal.status WON) alimentent le few-shot ; leur
// bodyText est dérivé du bodyJson ProseMirror via proseMirrorToText (NON VIDE pour un corps réel).
//
// DÉGRADATION (T-4-degrade) : si la clé est absente, le generator lève AiUnavailableError ; on la
// laisse remonter telle quelle (le controller la mappe en 503). On ne logue JAMAIS brief ni clé.

// Combien d'exemples gagnés récents on injecte en few-shot (discrétion CONTEXT : 3-5).
const WON_FEW_SHOT_LIMIT = 5;
// Titre borné (la colonne title et le DTO Phase 3 bornent à 200).
const TITLE_MAX = 200;

type DecimalLike = { toString(): string };

interface PricingRow {
  name: string;
  unitPrice: DecimalLike;
  unit: string | null;
}

interface WonQuoteLineRow {
  description: string;
  quantity: DecimalLike;
  unitPrice: DecimalLike;
}

interface WonProposalRow {
  bodyJson: unknown;
  lines: WonQuoteLineRow[];
}

@Injectable()
export class AiProposalService {
  // @Inject explicite : SWC/esbuild n'émet pas design:paramtypes pour les interfaces -> token DI
  // Symbol obligatoire pour le generator (frontière LLM, fakée en test via overrideProvider).
  constructor(
    @Inject(PROPOSAL_GENERATOR) private readonly generator: ProposalGenerator,
    @Inject(ProposalsService) private readonly proposals: ProposalsService,
  ) {}

  // Génère une Proposal DRAFT pour un deal à partir d'un brief : lit la grille + l'historique gagné
  // de l'org (forOrg), appelle le generator, assemble le bodyJson, persiste via ProposalsService.
  async generateForDeal(
    orgId: string,
    dealId: string,
    _templateId: string | null | undefined,
    brief: string,
  ): Promise<ProposalDto> {
    const pricing = await this.readPricing(orgId);
    const wonExamples = await this.readWonProposals(orgId);

    // Frontière LLM (fakée en test). AiUnavailableError remonte -> 503 côté controller.
    const out = await this.generator.generate({ brief, pricing, wonExamples });

    const bodyJson = sectionsToProseMirror(out.bodySections);

    // Persistance via ProposalsService ÉTENDU (lines nested numériques, atomique). quantity/unitPrice
    // passés tels quels (NUMÉRIQUES, PAS de String()). IDOR dealId + snapshot + totaux decimal +
    // status DRAFT sont gérés par ce service — on ne réécrit AUCUNE de ces logiques.
    return this.proposals.createProposal(orgId, {
      dealId,
      title: out.scope.slice(0, TITLE_MAX),
      bodyJson,
      lines: out.quoteLines.map((l, position) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        position,
      })),
    });
  }

  // Grille de tarifs de l'org (PROP-05) — forOrg UNIQUEMENT. Decimal -> string au boundary.
  private async readPricing(orgId: string): Promise<GenerateProposalPricingItem[]> {
    const rows = (await forOrg(orgId).pricingItem.findMany({
      orderBy: { createdAt: "asc" },
    })) as unknown as PricingRow[];

    return rows.map((r) => ({
      name: r.name,
      unitPrice: r.unitPrice.toString(),
      unit: r.unit,
    }));
  }

  // Propositions GAGNÉES de l'org (deal.status WON) -> few-shot WON (AI-02). forOrg UNIQUEMENT :
  // l'orgId est injecté dans le where racine, le filtre `deal: { status: WON }` reste une condition
  // de relation -> aucune fuite cross-org. bodyText dérivé via proseMirrorToText (NON VIDE pour un
  // corps réel ; JAMAIS un placeholder vide).
  private async readWonProposals(orgId: string): Promise<GenerateProposalWonExample[]> {
    const rows = (await forOrg(orgId).proposal.findMany({
      where: { deal: { status: "WON" } },
      orderBy: { createdAt: "desc" },
      take: WON_FEW_SHOT_LIMIT,
      include: { lines: { orderBy: { position: "asc" } } },
    })) as unknown as WonProposalRow[];

    return rows.map((p) => ({
      bodyText: proseMirrorToText(p.bodyJson),
      lines: p.lines.map((l) => ({
        description: l.description,
        quantity: l.quantity.toString(),
        unitPrice: l.unitPrice.toString(),
      })),
    }));
  }
}
