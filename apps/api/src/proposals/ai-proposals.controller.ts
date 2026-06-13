import {
  Body,
  Controller,
  Inject,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { auth } from "@kessel/auth";
import { AiProposalService, AiUnavailableError } from "@kessel/ai";
import type { ProposalDto } from "@kessel/shared";
import { requireOrg } from "../shared/require-org";
import { GenerateProposalDto } from "./dto/generate-proposal.dto";

// POST /api/proposals/generate (PROP-04/05/06, AI-02) — controller DÉDIÉ.
//
// Pourquoi un controller séparé (et non une route sur ProposalsController) : ProposalsController
// déclare des routes paramétrées `:id` ; ajouter "generate" risquerait une collision d'ordre de
// matching. Un controller dédié sur le MÊME préfixe `api/proposals` isole proprement la route
// (Pitfall 5 RESEARCH). Derrière l'AuthGuard global, scopé forOrg via AiProposalService.
//
// DÉGRADATION (T-4-degrade) : si la génération IA est indisponible (clé absente -> AiUnavailableError),
// on renvoie 503 avec un message clair SANS fuite (jamais le détail SDK ni le brief — T-4-leak). Le
// reste de l'API (CRM, propositions manuelles) reste 200 : l'app boote et sert sans clé.
@Controller("api/proposals")
export class AiProposalsController {
  // @Inject explicite : esbuild (build + vitest) n'émet pas design:paramtypes -> token DI requis.
  constructor(
    @Inject(AiProposalService) private readonly ai: AiProposalService,
  ) {}

  @Post("generate")
  async generate(
    @Session() session: UserSession<typeof auth>,
    @Body() dto: GenerateProposalDto,
  ): Promise<ProposalDto> {
    try {
      return await this.ai.generateForDeal(
        requireOrg(session),
        dto.dealId,
        dto.templateId,
        dto.brief,
      );
    } catch (error: unknown) {
      // Clé absente (ou autre indisponibilité IA) -> 503 propre, pas de 500/crash, pas de fuite.
      if (error instanceof AiUnavailableError) {
        throw new ServiceUnavailableException(
          "Génération IA indisponible. Configurez ANTHROPIC_API_KEY pour activer cette fonctionnalité.",
        );
      }
      throw error;
    }
  }
}
