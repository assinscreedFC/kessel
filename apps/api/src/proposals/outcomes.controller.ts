import { Controller, Get, Inject } from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { OutcomeService } from "@kessel/proposals";
import type { ProposalOutcomeDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";

// GET /api/outcomes (AI-01 critère 2) — dataset d'apprentissage forOrg, READ-ONLY.
//
// Controller DÉDIÉ sur le préfixe `api/outcomes` (Pitfall 4) : AUCUNE route paramétrée `:id`, donc
// aucune collision d'ordre de matching NestJS. Derrière l'AuthGuard global (authentifié) ; scoping
// tenant via OutcomeService.listForOrg -> Proposal forOrg (ProposalOutcome est lu MÉDIÉ par son parent,
// jamais en direct -> isolation cross-org). PAS d'endpoint d'écriture "record-outcome" : l'issue est
// enregistrée UNIQUEMENT en effet de bord (signature -> WON, deal LOST -> LOST), jamais saisie à la main.
@Controller("api/outcomes")
export class OutcomesController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes -> token DI requis.
  constructor(@Inject(OutcomeService) private readonly outcome: OutcomeService) {}

  @Get()
  async list(
    @Session() session: UserSession<typeof auth>,
  ): Promise<ProposalOutcomeDto[]> {
    return this.outcome.listForOrg(requireOrg(session));
  }
}
