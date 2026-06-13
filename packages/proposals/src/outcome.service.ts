import { Injectable } from "@nestjs/common";
import { forOrg } from "@kessel/db";
import type { ProposalOutcomeContext, ProposalOutcomeDto } from "@kessel/shared";
import { buildOutcomeContext } from "./outcome-context";

// OutcomeService — boucle de données flywheel (AI-01, Phase 6). Enregistre l'issue LOST en EFFET DE
// BORD de la transition deal -> LOST (orchestré depuis apps/api, FOUND-05 : @kessel/crm ne peut PAS
// importer @kessel/proposals — l'orchestration vit dans la couche app qui injecte les deux services),
// et expose le dataset forOrg en lecture seule.
//
// FRONTIÈRES (FOUND-05) : consomme @kessel/db via forOrg(orgId) UNIQUEMENT. ProposalOutcome est HORS
// de SCOPED_MODELS (scopé-via-parent, pas de colonne orgId) -> tout accès est MÉDIÉ par la Proposal
// forOrg-scopée (nested write `proposal.update({ data: { outcome: { create } } })` + include), JAMAIS
// un accès direct au modèle outcome (non scopé -> fuite cross-tenant). C'est le pattern
// `events: { create }` de DeliveryService.sendProposal.

type DecimalLike = { toString(): string };

type ResolvedLostRow = {
  id: string;
  bodyJson: unknown;
  lines: { quantity: DecimalLike; unitPrice: DecimalLike }[];
  outcome: unknown;
};

type OutcomeRow = {
  id: string;
  title: string;
  outcome: {
    outcome: string;
    decidedAt: Date;
    reason: string | null;
    context: unknown;
  } | null;
};

@Injectable()
export class OutcomeService {
  // recordLostForDeal — effet de bord de deal -> LOST. GRACIEUX + IDEMPOTENT.
  //   - forOrg : un deal d'une autre org est invisible -> findFirst null -> rien (isolation via racine).
  //   - filtre status in [SENT, DRAFT] : ne cible JAMAIS une proposition SIGNED (= déjà WON, Pitfall 5).
  //   - if (!proposal) return : deal SANS proposition envoyée/brouillon -> no-op, AUCUNE erreur (Pitfall 6).
  //   - if (proposal.outcome) return : issue déjà enregistrée -> no-op (idempotence ; proposalId @unique
  //     le garantit aussi côté DB).
  //   - création en NESTED WRITE via la Proposal forOrg-scopée (jamais d'écriture directe sur le modèle outcome).
  async recordLostForDeal(orgId: string, dealId: string, reason?: string): Promise<void> {
    const proposal = (await forOrg(orgId).proposal.findFirst({
      where: { dealId, status: { in: ["SENT", "DRAFT"] } },
      include: { lines: true, outcome: true } as never,
      orderBy: { createdAt: "desc" },
    })) as unknown as ResolvedLostRow | null;

    if (!proposal) return; // GRACIEUX : pas de proposition -> rien, aucune erreur.
    if (proposal.outcome) return; // IDEMPOTENT : issue déjà enregistrée.

    const context: ProposalOutcomeContext = buildOutcomeContext(
      { bodyJson: proposal.bodyJson },
      proposal.lines,
    );

    await forOrg(orgId).proposal.update({
      where: { id: proposal.id },
      data: {
        outcome: {
          create: {
            outcome: "LOST",
            reason: reason ?? null,
            context: context as never,
          },
        },
      } as never,
    });
  }

  // listForOrg — dataset d'apprentissage de l'org (read-only, AI-01 critère 2). Lecture MÉDIÉE par la
  // Proposal forOrg-scopée (where outcome isNot null + include) -> isolation cross-tenant par la racine.
  // JAMAIS de lecture directe sur le modèle outcome. Le snapshot context est renvoyé tel quel (strings déjà).
  async listForOrg(orgId: string): Promise<ProposalOutcomeDto[]> {
    const rows = (await forOrg(orgId).proposal.findMany({
      where: { outcome: { isNot: null } },
      include: { outcome: true } as never,
      orderBy: { createdAt: "desc" },
    })) as unknown as OutcomeRow[];

    return rows
      .filter((p) => p.outcome)
      .map((p) => ({
        proposalId: p.id,
        proposalTitle: p.title,
        outcome: p.outcome!.outcome as ProposalOutcomeDto["outcome"],
        decidedAt: p.outcome!.decidedAt.toISOString(),
        reason: p.outcome!.reason,
        context: p.outcome!.context as ProposalOutcomeContext,
      }));
  }
}
